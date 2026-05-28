export interface UseCaseHandler<UseCaseParams, UseCaseResult> {
  run(params: UseCaseParams): Promise<UseCaseResult>;
}
