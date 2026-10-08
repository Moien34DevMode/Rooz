# Future HTTP boundary

No HTTP client or API calls are used in this prototype. Future `ApiTaskRepository`, `ApiScheduleRepository`, and `ApiNoteRepository` implementations should satisfy the contracts in `src/domain/repositories.ts`; inject them through `src/services/container.ts`. Keep transport details, authentication, and response mapping in this directory so feature components remain unaware of the data source.
