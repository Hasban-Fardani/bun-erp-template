import { createFileRoute } from "@tanstack/react-router";
import { AssistantScreen } from "../../features/assistant/screens/assistant.tsx";

function AssistantRoute() {
  const { c } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AssistantScreen
      conversationId={c}
      onConversationChange={(id) => void navigate({ search: id ? { c: id } : {}, replace: true })}
    />
  );
}

export const Route = createFileRoute("/_authenticated/assistant")({
  validateSearch: (search: Record<string, unknown>): { c?: string } => ({
    c: typeof search.c === "string" && search.c !== "" ? search.c : undefined,
  }),
  component: AssistantRoute,
});
