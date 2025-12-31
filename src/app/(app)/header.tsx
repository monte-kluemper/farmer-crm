import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";

export default async function AppHeader() {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    return (
        <header className="border-b bg-background">
            <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
                {/* Left: brand / nav */}
                <div className="flex items-center gap-6">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Image
                            src="/logotext310x50.png"
                            alt="Isifarmer"
                            width={120}
                            height={32}
                            priority
                        />
                    </Link>
                    
                    <nav className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                        <Link href="/dashboard" className="hover:text-foreground">
                            Dashboard
                        </Link>
                        <Link href="/restaurants" className="hover:text-foreground">
                            Restaurants
                        </Link>
                    </nav>
                </div>

                {/* Right: user + logout */}
                <div className="flex items-center gap-4">
                    {user?.email ? (
                        <span className="hidden sm:block text-sm text-muted-foreground">
                            {user.email}
                        </span>
                    ) : null}

                    <form action={signOut}>
                        <Button variant="outline" size="sm" type="submit">
                            Log out
                        </Button>
                    </form>
                </div>
            </div>
        </header>
    );
}
