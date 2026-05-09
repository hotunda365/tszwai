"use client";

import { useRouter } from "next/navigation";

interface AuthPromptModalProps {
  isOpen: boolean;
  questionCount: number;
  onClose: () => void;
}

export function AuthPromptModal({ isOpen, questionCount, onClose }: AuthPromptModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-stone-800 mb-2">聊天次數已達上限</h2>
        <p className="text-sm text-stone-600 mb-6">
          未登入用戶每天可提問 5 個問題。
          <br />
          您已提出 <span className="font-medium">{questionCount}</span> 個問題。
        </p>
        <p className="text-sm text-stone-600 mb-6">
          登入或建立帳號以解鎖無限提問。
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition"
          >
            關閉
          </button>
          <button
            onClick={() => router.push("/login")}
            className="flex-1 px-4 py-2 rounded-lg bg-stone-700 text-white font-medium hover:bg-stone-800 transition"
          >
            登入 / 註冊
          </button>
        </div>
      </div>
    </div>
  );
}
