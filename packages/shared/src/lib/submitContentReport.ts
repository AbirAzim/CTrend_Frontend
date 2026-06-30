import type { DocumentNode } from "graphql";
import { REPORT_CONTENT } from "../graphql/contentReports";
import { type ContentReportInput, toGraphqlReportInput } from "./contentReport";

type ReportMutateClient = {
  mutate(options: {
    mutation: DocumentNode;
    variables: { input: ReturnType<typeof toGraphqlReportInput> };
  }): Promise<unknown>;
};

/** Submits a structured content report stored in the backend moderation queue. */
export async function submitContentReport(
  client: ReportMutateClient,
  input: ContentReportInput,
): Promise<void> {
  await client.mutate({
    mutation: REPORT_CONTENT,
    variables: {
      input: toGraphqlReportInput(input),
    },
  });
}
