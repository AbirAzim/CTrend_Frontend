type NetworkErr = {
  statusCode?: number;
  result?: { errors?: { message: string }[] };
  bodyText?: string;
};

type ApolloLike = {
  graphQLErrors?: { message: string }[];
  networkError?: NetworkErr | null;
  message?: string;
};

function isApolloLike(err: unknown): err is ApolloLike {
  return (
    typeof err === "object" &&
    err !== null &&
    ("graphQLErrors" in err || "networkError" in err)
  );
}

export function getApolloErrorMessage(err: unknown): string {
  if (isApolloLike(err)) {
    const ne = (err as ApolloLike).networkError as NetworkErr | undefined;
    const fromNetResult = ne?.result?.errors?.at(0)?.message;
    if (fromNetResult) return fromNetResult;

    const gqlMsg = (err as ApolloLike).graphQLErrors?.at(0)?.message;
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

    return (err as ApolloLike).message ?? "Something went wrong.";
  }

  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
