import { redirect } from "next/navigation";
import { BookOpenText } from "lucide-react";
import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/workspace");
  const configured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="sidebar-brand-mark" style={{ margin: "0 auto" }}><BookOpenText size={18} /></div>
        <h1>NativeNote</h1>
        <p>Một không gian viết yên tĩnh, nơi AI giúp bạn nhận ra thói quen ngôn ngữ và luyện lại chúng trong ngữ cảnh thật.</p>
        {!configured && <div className="error-banner">Thêm AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET và AUTH_SECRET vào .env.local để bật đăng nhập.</div>}
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/workspace" }); }}>
          <button className="primary-button" type="submit" disabled={!configured}>Tiếp tục với Google</button>
        </form>
      </section>
    </main>
  );
}
