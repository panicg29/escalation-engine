import { redirect } from "next/navigation";

export default function SentinelFeedRedirect() {
  redirect("/sentinel/dashboard");
}
