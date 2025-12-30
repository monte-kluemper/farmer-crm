import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function getMyFarms() {
    const supabase = await createSupabaseServerClient();

    // If already in a farm, skip onboarding
    const { data: memberships } = await supabase
        .from("farm_memberships")
        .select("farm_id, role, farms(name)")
        .limit(1);

    return memberships ?? [];
}

export default async function OnboardingPage() {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) redirect("/login");

    const memberships = await getMyFarms();
    if (memberships.length > 0) redirect("/dashboard");

    // Fetch Madrid city id for convenience (optional)
    const { data: madrid } = await supabase
        .from("cities")
        .select("id")
        .eq("country_code", "ES")
        .eq("name", "Madrid")
        .maybeSingle();

    const madridId = madrid?.id ?? null;

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>Create your farm</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Set up your workspace. You’ll be the owner and can invite other members later.
                    </p>

                    <form action={createFarmAction}>
                        <input type="hidden" name="defaultCityId" value={madridId ?? ""} />

                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="farmName">
                                Farm name
                            </label>
                            <input
                                id="farmName"
                                name="farmName"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                placeholder="e.g., Isifarmer Madrid"
                                required
                            />
                        </div>

                        <div className="pt-4">
                            <Button type="submit" className="w-full">
                                Create farm
                            </Button>
                        </div>
                    </form>

                    <p className="text-xs text-muted-foreground">
                        Default city: Madrid (can expand later).
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

// Server Action must be in same file or separate actions.ts in Next.js App Router
async function createFarmAction(formData: FormData) {
    "use server";

    const farmName = String(formData.get("farmName") || "").trim();
    const defaultCityIdRaw = String(formData.get("defaultCityId") || "").trim();
    const defaultCityId = defaultCityIdRaw.length ? defaultCityIdRaw : null;

    if (!farmName) redirect("/onboarding?error=missing_name");

    const supabase = createSupabaseServerClient();

    // Call the RPC
    const { data: farmId, error } = await supabase.rpc("create_my_farm", {
        p_farm_name: farmName,
        p_city_id: defaultCityId,
    });

    if (error) {
        redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
    }

    redirect("/dashboard");
}
