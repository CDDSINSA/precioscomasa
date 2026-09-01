import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

type FeedbackProps = {
  tone: "success" | "warning" | "info";
  message: string;
};

export function AppFeedback({ tone, message }: FeedbackProps) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : Info;
  return (
    <div className={`feedback ${tone}`} role="status">
      <Icon size={17} />
      <span>{message}</span>
    </div>
  );
}
