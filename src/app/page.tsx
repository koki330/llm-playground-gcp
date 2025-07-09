import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import ChatView from "@/components/chat-view";
import { AppProvider } from "@/context/AppContext";

export default function Home() {
  return (
    <AppProvider>
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col">
            <ChatView />
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
