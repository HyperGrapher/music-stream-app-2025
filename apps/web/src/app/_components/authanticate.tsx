"use client";
import SignOutButton from "./signout";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export default function Auth() {

    const { data: session } = authClient.useSession();

    const signIn = async () => {
        const { data, error } = await authClient.signIn.email({
            email: "burak@test.com",
            password: "bm123456",
        },
            {
                onError: (ctx) => {
                    // Handle the error
                    if (ctx.error.status === 403) {
                        alert("Please verify your email address");
                    }
                    //you can also show the original error message
                    alert(ctx.error.message);
                },
            }


        );
    };

    const signUp = async () => {
        const { data, error } = await authClient.signUp.email({
            email: "burak@test.com",
            password: "bm123456",
            name: "burak",
        });

        console.log(data, error);
    };

    // const signInWithGoogle = async () => {
    //     const data = await authClient.signIn.social({
    //         provider: "google"
    //     })
    // }



    return (
        <main className="flex flex-col gap-3 items-center justify-center p-10">
            <div className="flex gap-3">
                <Button
                    className="bg-blue-500 active:bg-blue-700 hover:bg-blue-600 text-white p-2 rounded-md"
                    onClick={() => null}
                >
                    Sign In with Google
                </Button>
                <button
                    className="bg-teal-500 active:bg-teal-700 hover:bg-teal-600 text-white p-2 rounded-md"
                    onClick={signUp}
                >
                    Sign Up with Email
                </button>

                <button
                    className="bg-violet-500 active:bg-violet-700 hover:bg-violet-600 text-white p-2 rounded-md"
                    onClick={signIn}
                >
                    Sign In with Email
                </button>

                <SignOutButton />
            </div>
            <p>{!session ? "Not authenticated !!" : session.user.name}</p>
            <pre>
                {JSON.stringify(session, null, 2)}
            </pre>
        </main>
    );
}