import type { ApolloClient } from "@apollo/client";
import { REPORT_CONTENT } from "../graphql/contentReports";
import { type ContentReportInput, toGraphqlReportInput } from "./contentReport";

/** Submits a structured content report stored in the backend moderation queue. */
export async function submitContentReport(
  client: ApolloClient<unknown>,
  input: ContentReportInput,
): Promise<void> {
  await client.mutate({
    mutation: REPORT_CONTENT,
    variables: {
      input: toGraphqlReportInput(input),
    },
  });
}
