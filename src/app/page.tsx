import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePw) redirect("/change-password");
  redirect(user.role === "ADMIN" ? "/admin" : "/timesheet");
}
