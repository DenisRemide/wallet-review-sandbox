"""Report this repository's branch history to a Live Model install.

This file is shipped by Live Model's setup pull request and runs where the
repository already is — a GitHub Actions runner, usually — because the install
that measures the repository has no working copy of it and does not fetch one.
It walks one branch, writes the rows out as JSON and computes nothing: no rate,
no percentile, no verdict. Every rule that turns these rows into a figure is
applied where the report is read, which is what lets a rule change re-answer a
report written months ago.

It needs only Python 3.11+ and git. Nothing is installed and no index is
contacted; the receiving side validates everything again at its own door.

It is a copy, and copies drift, so the original is pinned: the Live Model
repository keeps this file beside the walker its own clones are measured with
(metrics/collector.py) and tests that the two produce identical documents from
the same repositories. Edit it there, not here.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

GIT_TIMEOUT_SECONDS = 300
GIT_ENVIRONMENT_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR")
GIT_CONFIG_OVERRIDES = (
    # Pinned so the walked repository cannot move its own numbers from
    # `.git/config`; the reasoning for each line is with the original walker.
    "-c",
    "core.quotePath=false",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "diff.renames=true",
    "-c",
    "diff.renameLimit=0",
)

RECORD_SEPARATOR = "\x1e"
UNIT_SEPARATOR = "\x1f"
WALK_FORMAT = (
    f"{RECORD_SEPARATOR}%H{UNIT_SEPARATOR}%cI{UNIT_SEPARATOR}%cn{UNIT_SEPARATOR}%s"
    "%n%(trailers:only,unfold)"
)
RECORD_START = re.compile(f"{RECORD_SEPARATOR}(?=[0-9a-f]{{7,64}}{UNIT_SEPARATOR})")
REMOTE_PREFIX = "origin/"

# The caps a report must fit; the receiving side refuses what exceeds them.
MAX_COMMITS = 20_000
MAX_FILES_PER_COMMIT = 3_000
MAX_FILE_ROWS = 100_000
MAX_PATH_LENGTH = 4_096
MAX_SUBJECT_LENGTH = 1_000
MAX_NAME_LENGTH = 255
MAX_TRAILERS_PER_COMMIT = 32
MAX_TRAILER_LENGTH = 512
MIN_OBSERVABLE_THRESHOLD = 1
MAX_OBSERVABLE_THRESHOLD = 100_000

FAR_PAST = datetime(1970, 1, 1, tzinfo=UTC)


class CourierError(Exception):
    """A stated reason this walk cannot become a report."""


@dataclass(frozen=True)
class FileRow:
    path: str
    added: int
    deleted: int
    binary: bool


@dataclass(frozen=True)
class Commit:
    sha: str
    merged_at: datetime
    merged_by: str
    subject: str
    files: tuple[FileRow, ...]
    trailers: tuple[str, ...] = ()


def _git_environment() -> dict[str, str]:
    return {name: os.environ[name] for name in GIT_ENVIRONMENT_ALLOWLIST if name in os.environ}


def _git(repository: Path, *arguments: str) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repository), *GIT_CONFIG_OVERRIDES, *arguments],
            capture_output=True,
            env=_git_environment(),
            timeout=GIT_TIMEOUT_SECONDS,
            shell=False,
            check=False,
        )
    except FileNotFoundError as error:
        raise CourierError("git is not installed") from error
    except subprocess.TimeoutExpired as error:
        raise CourierError(f"git {' '.join(arguments)} timed out") from error
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace")
        raise CourierError(f"git {' '.join(arguments)} failed: {stderr.strip()[:500]}")
    return completed.stdout.decode("utf-8", errors="replace")


def rev_parse(repository: Path, revision: str) -> str | None:
    try:
        resolved = _git(repository, "rev-parse", "--verify", "-q", revision).strip()
    except CourierError:
        return None
    return resolved or None


def resolve_branch(repository: Path, branch: str) -> str:
    """The stated branch, or its remote-tracking ref — never a guess.

    The workflow always names the default branch, so an unresolvable name is an
    error to read in the log, not a cue to try other branches: a walk of the
    wrong branch would be refused at the door, silently, on every run.
    """
    if rev_parse(repository, branch):
        return branch
    if not branch.startswith(REMOTE_PREFIX):
        remote = f"{REMOTE_PREFIX}{branch}"
        if rev_parse(repository, remote):
            return remote
    raise CourierError(f"git cannot resolve branch {branch!r} in {repository}")


def branch_name(reference: str) -> str:
    return reference[len(REMOTE_PREFIX) :] if reference.startswith(REMOTE_PREFIX) else reference


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _parse_numstat(records: list[str]) -> tuple[FileRow, ...]:
    files: list[FileRow] = []
    index = 0
    while index < len(records):
        record = records[index].lstrip("\n")
        index += 1
        if not record:
            continue
        columns = record.split("\t")
        if len(columns) != 3:
            continue
        raw_added, raw_deleted, path = columns
        if not path:
            # A rename or copy: source and destination follow as their own
            # records, and the destination is where the lines now live.
            if index + 1 >= len(records):
                break
            path = records[index + 1]
            index += 2
        binary = raw_added == "-" or raw_deleted == "-"
        files.append(
            FileRow(
                path=path,
                added=0 if binary else int(raw_added),
                deleted=0 if binary else int(raw_deleted),
                binary=binary,
            )
        )
    return tuple(files)


def parse_walk(output: str) -> tuple[Commit, ...]:
    commits: list[Commit] = []
    for chunk in RECORD_START.split(output)[1:]:
        records = chunk.split("\0")
        lines = records[0].split("\n")
        header = lines[0].split(UNIT_SEPARATOR, 3)
        if len(header) != 4:
            continue
        sha, committed_at, merged_by, subject = header
        commits.append(
            Commit(
                sha=sha,
                merged_at=_parse_timestamp(committed_at),
                merged_by=merged_by,
                subject=subject,
                files=_parse_numstat(records[1:]),
                trailers=_parse_trailers(lines[1:]),
            )
        )
    return tuple(commits)


def _parse_trailers(lines: list[str]) -> tuple[str, ...]:
    # Bounded where the walk runs, exactly as the original walker bounds it.
    kept = [line for line in lines if line and len(line) <= MAX_TRAILER_LENGTH]
    return tuple(kept[:MAX_TRAILERS_PER_COMMIT])


def walk(repository: Path, branch: str, since: datetime) -> tuple[Commit, ...]:
    log = _git(
        repository,
        "log",
        "--first-parent",
        "-m",
        "--numstat",
        "-z",
        f"--format={WALK_FORMAT}",
        branch,
    )
    return tuple(commit for commit in parse_walk(log) if commit.merged_at >= since)


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _check(commit: Commit) -> None:
    if len(commit.merged_by) > MAX_NAME_LENGTH:
        raise CourierError(f"{commit.sha}: committer name longer than {MAX_NAME_LENGTH}")
    if len(commit.subject) > MAX_SUBJECT_LENGTH:
        raise CourierError(f"{commit.sha}: subject longer than {MAX_SUBJECT_LENGTH}")


def commit_row(commit: Commit) -> dict[str, object]:
    """One commit as the report carries it, totals when too wide to list.

    Paths are checked only on the listed branch: a commit sent as totals
    carries no path rows, so a path the receiving schema would never see must
    not abort the report.
    """
    _check(commit)
    if len(commit.files) > MAX_FILES_PER_COMMIT:
        unlisted: dict[str, int] | None = {
            "files": len(commit.files),
            "added": sum(row.added for row in commit.files),
            "deleted": sum(row.deleted for row in commit.files),
        }
        files: list[dict[str, object]] = []
    else:
        for row in commit.files:
            if not row.path or len(row.path) > MAX_PATH_LENGTH:
                raise CourierError(
                    f"{commit.sha}: a path is empty or longer than {MAX_PATH_LENGTH}"
                )
        unlisted = None
        files = [
            {"path": row.path, "added": row.added, "deleted": row.deleted, "binary": row.binary}
            for row in commit.files
        ]
    return {
        "sha": commit.sha,
        "merged_at": _iso(commit.merged_at),
        "merged_by": commit.merged_by,
        "subject": commit.subject,
        "files": files,
        "unlisted": unlisted,
        "trailers": list(commit.trailers),
    }


def build_document(
    commits: tuple[Commit, ...],
    *,
    branch: str,
    head_sha: str,
    collected_at: datetime,
    covers_since: datetime | None,
    declared_threshold: int | None,
) -> dict[str, object]:
    if len(commits) > MAX_COMMITS:
        raise CourierError(
            f"the walk found {len(commits)} commits, more than the {MAX_COMMITS} one report "
            "may carry — walk a shorter window with --days"
        )
    rows = [commit_row(commit) for commit in commits]
    file_rows = sum(
        len(commit.files) for commit in commits if len(commit.files) <= MAX_FILES_PER_COMMIT
    )
    if file_rows > MAX_FILE_ROWS:
        raise CourierError(
            f"the walk produced {file_rows} file rows, more than the {MAX_FILE_ROWS} one report "
            "may hold — walk a shorter window with --days"
        )
    return {
        "branch": branch,
        "head_sha": head_sha,
        "collected_at": _iso(collected_at),
        "covers_since": _iso(covers_since) if covers_since is not None else None,
        "declared_threshold": declared_threshold,
        "commits": rows,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0] if __doc__ else None)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--branch", required=True, help="the branch the report is about")
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--observable-threshold", type=int, default=None)
    parser.add_argument("--out", type=Path, required=True)
    arguments = parser.parse_args(argv)
    threshold: int | None = arguments.observable_threshold
    in_bounds = threshold is None or (
        MIN_OBSERVABLE_THRESHOLD <= threshold <= MAX_OBSERVABLE_THRESHOLD
    )
    if not in_bounds:
        raise CourierError(
            f"an observable threshold must be between {MIN_OBSERVABLE_THRESHOLD} and "
            f"{MAX_OBSERVABLE_THRESHOLD}, not {threshold}"
        )
    since = None if arguments.days is None else datetime.now(UTC) - timedelta(days=arguments.days)
    resolved = resolve_branch(arguments.repo, arguments.branch)
    head_sha = rev_parse(arguments.repo, resolved)
    if head_sha is None:
        raise CourierError(f"cannot resolve {resolved}")
    commits = walk(arguments.repo, resolved, since or FAR_PAST)
    document = build_document(
        commits,
        branch=branch_name(resolved),
        head_sha=head_sha,
        collected_at=datetime.now(UTC),
        covers_since=since,
        declared_threshold=threshold,
    )
    arguments.out.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
    listed = sum(
        len(commit.files) for commit in commits if len(commit.files) <= MAX_FILES_PER_COMMIT
    )
    print(
        f"{document['branch']}: {len(commits)} commits, {listed} file rows"
        + (f", from {since.date().isoformat()}" if since else ", whole history")
        + (f", declaring {threshold} observable lines" if threshold is not None else "")
    )
    return 0 if commits else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CourierError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from None
