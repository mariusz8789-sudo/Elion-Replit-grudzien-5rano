import { Lock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState } from "react";

//todo: remove mock functionality
const mockContacts = [
  { id: 1, name: "Alice Johnson", lastMessage: "See you tomorrow!", time: "10:30 AM", unread: 2, online: true },
  { id: 2, name: "Bob Smith", lastMessage: "The files are encrypted", time: "9:15 AM", unread: 0, online: true },
  { id: 3, name: "Carol White", lastMessage: "Thanks for the update", time: "Yesterday", unread: 0, online: false },
  { id: 4, name: "Dave Brown", lastMessage: "Can we schedule a call?", time: "Tuesday", unread: 1, online: false },
];

export default function ContactsList() {
  const [selected, setSelected] = useState(1);
  const [search, setSearch] = useState("");
  
  const filteredContacts = mockContacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    <div className="w-80 border-r border-border bg-card flex flex-col h-screen">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground font-[Outfit]">Messages</h1>
          <Button size="icon" variant="ghost" data-testid="button-new-chat">
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() => {
              setSelected(contact.id);
            }}
            className={cn(
              "w-full p-4 flex items-start gap-3 hover-elevate transition-colors border-b border-border",
              selected === contact.id && "bg-muted/50"
            )}
            data-testid={`contact-${contact.id}`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <span className="text-sm font-medium text-foreground">
                  {contact.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              {contact.online && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card"></div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm text-foreground truncate">
                  {contact.name}
                </h3>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {contact.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground truncate">
                    {contact.lastMessage}
                  </p>
                </div>
                {contact.unread > 0 && (
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center">
                    {contact.unread}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
