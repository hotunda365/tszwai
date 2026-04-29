"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ConfirmEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid confirmation link");
      return;
    }

    confirmEmail();
  }, [token]);

  const confirmEmail = async () => {
    try {
      const res = await fetch("/api/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Confirmation failed");
      }

      setStatus("success");
      setMessage("Email confirmed successfully! Redirecting to login...");

      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-stone-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
        <h1 className="text-3xl font-bold text-stone-800 mb-4">心靈導師</h1>

        {status === "loading" && (
          <div>
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-stone-700 mb-4" />
            <p className="text-stone-600">Confirming your email...</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="mb-4">
              <svg
                className="h-12 w-12 mx-auto text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-green-600 font-medium">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="mb-4">
              <svg
                className="h-12 w-12 mx-auto text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-4">{message}</p>
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-stone-600 hover:text-stone-700 underline"
            >
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
