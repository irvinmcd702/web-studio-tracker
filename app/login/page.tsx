import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { AuthFrame } from "@/components/shell/auth-frame";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "CLIENT" ? "/portal" : "/dashboard");

  return (
    <AuthFrame
      title="Sign in"
      description="Projects, tickets, hours and the client portal, in one place."
      homeHref="/login"
    >
      <LoginForm />
    </AuthFrame>
  );
}
