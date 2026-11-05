import { redirect } from "next/navigation";

export default function LoginRedirectPage() {
  redirect("/panel");
}
