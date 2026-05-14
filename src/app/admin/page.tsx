import { redirect } from "next/navigation";

// Bare /admin → reports list. The layout has already enforced admin auth.
export default function AdminIndex() {
  redirect("/admin/reports");
}
