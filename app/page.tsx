import MobileChatPage from "./MobileChatPage";
import { ProtectedPage } from "@/lib/protected-page";

export default function Home() {
  return (
    <ProtectedPage>
      <MobileChatPage />
    </ProtectedPage>
  );
}
