import { ApolloError } from "@apollo/client";

type NetworkErr = {
  statusCode?: number;
  result?: { errors?: { message: string }[] };
  bodyText?: string;
};

/** Thrown by Apollo HttpLink on non-2xx; may carry parsed GraphQL `result`. */
type ServerErrorLike = Error & {
  result?: { errors?: { message: string }[] };
};

function isServerError(err: unknown): err is ServerErrorLike {
  return err instanceof Error && err.name === "ServerError";
}

/**
 * Prefer GraphQL `errors[].message` when the server returns 4xx with a JSON body.
 */
export function getApolloErrorMessage(err: unknown): string {
  if (isServerError(err)) {
    const fromResult = err.result?.errors?.at(0)?.message;
    if (fromResult) return fromResult;
  }

  if (err instanceof ApolloError) {
    const ne = err.networkError as NetworkErr | undefined;
    const fromNetResult = ne?.result?.errors?.at(0)?.message;
    if (fromNetResult) return fromNetResult;

    const gqlMsg = err.graphQLErrors.at(0)?.message;
    if (gqlMsg) return gqlMsg;

    if (ne?.bodyText) {
      try {
        const parsed = JSON.parse(ne.bodyText) as {
          errors?: { message: string }[];
          message?: string;
        };
        const msg = parsed.errors?.at(0)?.message ?? parsed.message;
        if (msg) return msg;
      } catch {
        /* ignore */
      }
    }

    return err.message;
  }

  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
