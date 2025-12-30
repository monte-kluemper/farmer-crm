// src/app/login/page.tsx
import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
    searchParams,
}: {
    // In some Next.js versions, searchParams can be a Promise
    searchParams?: Promise<SearchParams>;
}) {
    const sp = (await searchParams) ?? {};

    const error = typeof sp.error === "string" ? sp.error : "";
    const checkEmail = sp.check_email === "1";
    const next =
        typeof sp.next === "string" && sp.next.length > 0 ? sp.next : "/dashboard";

    return (
        <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-neutral-900">Sign in</h1>
                    <p className="text-sm text-neutral-600">
                        We will email you a magic link to sign in.
                    </p>
                </div>

                {error ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {decodeURIComponent(error)}
                    </div>
                ) : null}

                {checkEmail ? (
                    <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900">
                        Check your email for the magic link.
                    </div>
                ) : null}

                <form action="/auth/login" method="post" className="mt-6 space-y-4">
                    <input type="hidden" name="next" value={next} />

                    <div className="space-y-2">
                        <label
                            htmlFor="email"
                            className="block text-sm font-medium text-neutral-800"
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            placeholder="you@example.com"
                            autoComplete="email"
                            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                        Send magic link
                    </button>

                    <p className="text-xs text-neutral-500">
                        By continuing, you agree to our{" "}
                        <Link href="/terms" className="underline hover:text-neutral-700">
                            Terms
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline hover:text-neutral-700">
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </form>
            </div>
        </main>
    );
}
