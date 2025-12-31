// src/app/onboarding/page.tsx
import { createFarm } from "./actions";

export default function OnboardingPage() {
    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-semibold">Create your farm</h1>

            <form action={createFarm} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">Farm name</label>
                    <input
                        name="farm_name"
                        required
                        className="mt-1 w-full rounded border px-3 py-2"
                    />
                </div>

                <button className="rounded bg-black px-4 py-2 text-white">
                    Continue
                </button>
            </form>
        </main>
    );
}
