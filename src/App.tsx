import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, 
  MessageCircle, 
  Repeat2, 
  Share, 
  MoreHorizontal, 
  Search, 
  Home, 
  Bell, 
  Mail, 
  User as UserIcon,
  CheckCircle2,
  RefreshCw,
  X,
  ThumbsDown,
  Plus,
  ArrowLeft,
  Camera
} from "lucide-react";

interface Status {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  avatar: string;
  content: string;
  imageUrl: string | null;
  repostOfId: number | null;
  quoteText: string | null;
  likes: number;
  dislikes: number;
  repostsCount: number;
  myInteraction: "like" | "dislike" | "repost" | null;
  createdAt: string;
  origFirstName?: string;
  origLastName?: string;
  origContent?: string;
  origImageUrl?: string | null;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  avatar: string;
}

export default function App() {
  const [userId, setUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem("ego_user_id");
    return saved ? parseInt(saved) : null;
  });
  const [me, setMe] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"suggested" | "following" | "global">("global");
  const [currentView, setCurrentView] = useState<"feed" | "explore" | "notifications" | "profile">("feed");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profileUser, setProfileUser] = useState<User | any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regForm, setRegForm] = useState({ firstName: "", lastName: "", avatar: "", bio: "" });
  const [newPost, setNewPost] = useState("");
  const [newPostImage, setNewPostImage] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [quotePost, setQuotePost] = useState<Status | null>(null);
  const [expandedComments, setExpandedComments] = useState<number | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");

  const apiFetch = async (url: string, options: any = {}) => {
    const headers = {
      ...options.headers,
      "Content-Type": "application/json",
      "x-user-id": userId?.toString() || "",
    };
    return fetch(url, { ...options, headers });
  };

  const fetchMe = async () => {
    if (!userId) return;
    try {
      const res = await apiFetch("/api/me");
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data) setMe(data);
        else throw new Error("Invalid user data");
      } else {
        setUserId(null);
        localStorage.removeItem("ego_user_id");
      }
    } catch (e) {
      console.error("Me fetch error:", e);
      setUserId(null);
      localStorage.removeItem("ego_user_id");
    }
  };

  const fetchFeed = async () => {
    if (!userId || currentView !== "feed") return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/feed/${activeTab}`);
      if (!res.ok) throw new Error("Failed to fetch feed");
      const data = await res.json();
      setStatuses(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Feed fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (id: number) => {
    try {
      setLoading(true);
      const [uRes, sRes] = await Promise.all([
        apiFetch(`/api/users/${id}`),
        apiFetch(`/api/users/${id}/statuses`)
      ]);
      if (uRes.ok) setProfileUser(await uRes.json());
      if (sRes.ok) setStatuses(await sRes.json());
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/notifications");
      if (res.ok) setNotifications(await res.json());
    } catch (e) {
      console.error("Notifications fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestedUsers = async () => {
    try {
      const res = await apiFetch("/api/users/suggested");
      if (res.ok) setSuggestedUsers(await res.json());
    } catch (e) {
      console.error("Suggested users error:", e);
    }
  };

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setStatuses(await res.json());
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchMe();
      fetchSuggestedUsers();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    
    if (currentView === "feed") fetchFeed();
    else if (currentView === "notifications") fetchNotifications();
    else if (currentView === "profile" && selectedProfileId) fetchProfile(selectedProfileId);
    
    const interval = setInterval(() => {
      if (currentView === "feed") fetchFeed();
      else if (currentView === "notifications") fetchNotifications();
      else if (currentView === "profile" && selectedProfileId) fetchProfile(selectedProfileId);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [userId, activeTab, currentView, selectedProfileId]);

  const fetchComments = async (statusId: number) => {
    try {
      const res = await apiFetch(`/api/comments/${statusId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Comments fetch error:", e);
      setComments([]);
    }
  };

  const handleComment = async (statusId: number) => {
    if (!newComment.trim()) return;
    const res = await apiFetch("/api/comments", {
      method: "POST",
      body: JSON.stringify({ statusId, content: newComment }),
    });
    if (res.ok) {
      setNewComment("");
      fetchComments(statusId);
    } else {
      const err = await res.json().catch(() => ({ error: "Failed to comment" }));
      alert(err.error || "Failed to comment");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const avatar = regForm.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${regForm.firstName}${regForm.lastName}`;
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...regForm, avatar }),
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Registration failed" }));
        alert(err.error || "Registration failed");
        return;
      }
      
      const data = await res.json();
      localStorage.setItem("ego_user_id", data.id.toString());
      setUserId(data.id);
      setIsRegistering(false);
    } catch (e) {
      console.error("Registration error:", e);
      alert("An unexpected error occurred during registration.");
    }
  };

  const handlePost = async () => {
    if (!newPost.trim() && !quotePost && !newPostImage) return;
    await apiFetch("/api/statuses", {
      method: "POST",
      body: JSON.stringify({
        content: newPost,
        repostOfId: quotePost?.id || null,
        quoteText: quotePost ? newPost : null,
        imageUrl: newPostImage || null
      }),
    });
    setNewPost("");
    setNewPostImage("");
    setShowImageInput(false);
    setQuotePost(null);
    fetchFeed();
  };

  const handleInteraction = async (statusId: number, type: "like" | "dislike" | "repost") => {
    await apiFetch("/api/interactions", {
      method: "POST",
      body: JSON.stringify({ statusId, type }),
    });
    fetchFeed();
  };

  const handleFollow = async (userIdToFollow: number) => {
    await apiFetch("/api/follow", {
      method: "POST",
      body: JSON.stringify({ userId: userIdToFollow }),
    });
    if (currentView === "feed") fetchFeed();
    if (currentView === "profile" && selectedProfileId) fetchProfile(selectedProfileId);
  };

  if (!userId && !isRegistering) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center p-6 font-sans">
        <h1 className="text-6xl font-bold tracking-tighter mb-8 text-[#1A1A1A]">EGO</h1>
        <p className="text-[#666] mb-12 text-center max-w-md leading-relaxed">
          The first social network designed for real human interaction. 
          No bots. No filters. Just raw engagement.
        </p>
        <button 
          onClick={() => setIsRegistering(true)}
          className="bg-[#1A1A1A] text-white px-12 py-4 rounded-full font-bold hover:bg-black transition-all shadow-lg"
        >
          Enter the Ego
        </button>
      </div>
    );
  }

  if (isRegistering) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white p-12 rounded-3xl shadow-sm border border-[#EEE]">
          <button onClick={() => setIsRegistering(false)} className="mb-8 text-[#999] hover:text-black transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-3xl font-bold mb-8 text-[#1A1A1A]">Create Profile</h2>
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#999] mb-2">First Name</label>
              <input 
                required
                className="w-full bg-[#F5F5F5] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#1A1A1A] outline-none transition-all"
                value={regForm.firstName}
                onChange={e => setRegForm({...regForm, firstName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#999] mb-2">Last Name</label>
              <input 
                required
                className="w-full bg-[#F5F5F5] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#1A1A1A] outline-none transition-all"
                value={regForm.lastName}
                onChange={e => setRegForm({...regForm, lastName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#999] mb-2">Profile Picture URL (Optional)</label>
              <input 
                className="w-full bg-[#F5F5F5] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#1A1A1A] outline-none transition-all"
                placeholder="https://..."
                value={regForm.avatar}
                onChange={e => setRegForm({...regForm, avatar: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#999] mb-2">Bio</label>
              <textarea 
                className="w-full bg-[#F5F5F5] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#1A1A1A] outline-none transition-all resize-none"
                rows={3}
                value={regForm.bio}
                onChange={e => setRegForm({...regForm, bio: e.target.value})}
              />
            </div>
            <button className="w-full bg-[#1A1A1A] text-white py-4 rounded-xl font-bold hover:bg-black transition-all">
              Join Network
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A] selection:text-white">
      <div className="max-w-[1200px] mx-auto flex">
        
        {/* Navigation */}
        <aside className="w-[280px] sticky top-0 h-screen flex flex-col px-6 py-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tighter">EGO</h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            <NavItem 
              icon={<Home size={24} />} 
              label="Feed" 
              active={currentView === "feed"} 
              onClick={() => setCurrentView("feed")}
            />
            <NavItem 
              icon={<Search size={24} />} 
              label="Explore" 
              active={currentView === "explore"}
              onClick={() => setCurrentView("explore")}
            />
            <NavItem 
              icon={<Bell size={24} />} 
              label="Alerts" 
              active={currentView === "notifications"}
              onClick={() => setCurrentView("notifications")}
            />
            <NavItem 
              icon={<Mail size={24} />} 
              label="Messages" 
              onClick={() => alert("Direct Messages coming soon!")}
            />
            <NavItem 
              icon={<UserIcon size={24} />} 
              label="Profile" 
              active={currentView === "profile" && selectedProfileId === me?.id}
              onClick={() => {
                if (me) {
                  setSelectedProfileId(me.id);
                  setCurrentView("profile");
                }
              }}
            />
          </nav>

          <div className="mt-auto p-4 bg-white rounded-2xl border border-[#EEE] flex items-center gap-3">
            {me && (
              <>
                <img src={me.avatar} className="w-10 h-10 rounded-full bg-[#EEE]" alt="Me" />
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold truncate text-sm">{me.firstName} {me.lastName}</p>
                  <button 
                    onClick={() => { localStorage.removeItem("ego_user_id"); setUserId(null); }}
                    className="text-[#999] text-[10px] uppercase font-bold tracking-widest hover:text-black"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-[640px] bg-white min-h-screen border-x border-[#EEE]">
          {currentView === "feed" && (
            <>
              <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#EEE]">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab("global")}
                    className="flex-1 py-6 relative group"
                  >
                    <span className={`text-sm font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "global" ? "text-black" : "text-[#999] group-hover:text-black"}`}>
                      Global
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    </span>
                    {activeTab === "global" && (
                      <motion.div layoutId="tab" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-black rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("suggested")}
                    className="flex-1 py-6 relative group"
                  >
                    <span className={`text-sm font-bold uppercase tracking-widest transition-all ${activeTab === "suggested" ? "text-black" : "text-[#999] group-hover:text-black"}`}>
                      Suggested
                    </span>
                    {activeTab === "suggested" && (
                      <motion.div layoutId="tab" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-black rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("following")}
                    className="flex-1 py-6 relative group"
                  >
                    <span className={`text-sm font-bold uppercase tracking-widest transition-all ${activeTab === "following" ? "text-black" : "text-[#999] group-hover:text-black"}`}>
                      Following
                    </span>
                    {activeTab === "following" && (
                      <motion.div layoutId="tab" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-black rounded-full" />
                    )}
                  </button>
                </div>
              </header>

              {/* Composer */}
              <div className="p-6 border-b border-[#EEE]">
                <div className="flex gap-4">
                  <img src={me?.avatar} className="w-12 h-12 rounded-full bg-[#F5F5F5]" alt="Me" />
                  <div className="flex-1">
                    {quotePost && (
                      <div className="mb-4 p-4 bg-[#F9F9F9] rounded-2xl border border-[#EEE] relative">
                        <button onClick={() => setQuotePost(null)} className="absolute top-2 right-2 text-[#999] hover:text-black">
                          <X size={16} />
                        </button>
                        <p className="text-xs font-bold text-[#999] mb-1 uppercase tracking-widest">Quoting {quotePost.firstName}</p>
                        <p className="text-sm line-clamp-2">{quotePost.content}</p>
                      </div>
                    )}
                    <textarea 
                      placeholder="What's on your mind?"
                      className="w-full bg-transparent border-none resize-none text-xl focus:ring-0 outline-none min-h-[100px]"
                      value={newPost}
                      onChange={e => setNewPost(e.target.value)}
                    />
                    {showImageInput && (
                      <div className="mb-4">
                        <input 
                          placeholder="Paste image URL..."
                          className="w-full bg-[#F5F5F5] border-none rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-black"
                          value={newPostImage}
                          onChange={e => setNewPostImage(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-4 border-t border-[#F9F9F9]">
                      <div className="flex gap-2 text-[#999]">
                        <button 
                          onClick={() => setShowImageInput(!showImageInput)}
                          className={`p-2 hover:bg-[#F9F9F9] rounded-full transition-colors ${showImageInput ? 'text-black bg-[#F9F9F9]' : ''}`}
                        >
                          <Camera size={20} />
                        </button>
                      </div>
                      <button 
                        onClick={handlePost}
                        disabled={!newPost.trim() && !quotePost && !newPostImage}
                        className="bg-black text-white px-8 py-2.5 rounded-full font-bold text-sm disabled:opacity-20 transition-all hover:scale-105 active:scale-95"
                      >
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === "explore" && (
            <div className="p-6">
              <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999]" size={20} />
                <input 
                  placeholder="Search EGO..."
                  className="w-full bg-[#F5F5F5] border-none rounded-full py-4 pl-12 pr-6 focus:ring-2 focus:ring-black outline-none transition-all"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) fetchFeed(); // Reset to global if empty
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch(searchQuery)}
                />
              </div>
              
              {searchQuery ? (
                <div className="mb-8">
                  <h2 className="text-xl font-bold mb-6">Search results for "{searchQuery}"</h2>
                  {statuses.length === 0 && !loading && (
                    <p className="text-[#999] text-center py-12">No results found.</p>
                  )}
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-6">Trending for you</h2>
                  <div className="space-y-6 mb-12">
                    <TrendItem title="Minimalism" posts="2.4k" onClick={() => { setSearchQuery("Minimalism"); handleSearch("Minimalism"); }} />
                    <TrendItem title="EGO Network" posts="1.1k" onClick={() => { setSearchQuery("EGO Network"); handleSearch("EGO Network"); }} />
                    <TrendItem title="Architecture" posts="842" onClick={() => { setSearchQuery("Architecture"); handleSearch("Architecture"); }} />
                  </div>
                </>
              )}
            </div>
          )}

          {currentView === "notifications" && (
            <div className="divide-y divide-[#EEE]">
              <header className="p-6 sticky top-0 bg-white/80 backdrop-blur-xl border-b border-[#EEE] z-10">
                <h2 className="text-xl font-bold">Notifications</h2>
              </header>
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-[#999]">
                  <p>No notifications yet.</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="p-6 flex gap-4 hover:bg-[#FAFAFA] transition-colors cursor-pointer">
                    <div className="mt-1">
                      {n.type === 'like' && <Heart size={20} className="text-red-500 fill-red-500" />}
                      {n.type === 'dislike' && <ThumbsDown size={20} className="text-black fill-black" />}
                      {n.type === 'repost' && <Repeat2 size={20} className="text-green-500" />}
                      {n.type === 'follow' && <UserIcon size={20} className="text-blue-500" />}
                      {n.type === 'comment' && <MessageCircle size={20} className="text-blue-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <img src={n.avatar} className="w-8 h-8 rounded-full" alt="" />
                        <span className="font-bold">{n.firstName} {n.lastName}</span>
                      </div>
                      <p className="text-sm text-[#666]">
                        {n.type === 'like' && 'liked your post'}
                        {n.type === 'dislike' && 'disliked your post'}
                        {n.type === 'repost' && 'reposted your post'}
                        {n.type === 'follow' && 'started following you'}
                        {n.type === 'comment' && 'commented on your post'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {currentView === "profile" && profileUser && (
            <div>
              <header className="p-4 sticky top-0 bg-white/80 backdrop-blur-xl border-b border-[#EEE] z-10 flex items-center gap-6">
                <button onClick={() => setCurrentView("feed")} className="p-2 hover:bg-[#F5F5F5] rounded-full transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h2 className="text-xl font-bold">{profileUser.firstName} {profileUser.lastName}</h2>
                  <p className="text-xs text-[#999] font-bold uppercase tracking-widest">{statuses.length} posts</p>
                </div>
              </header>
              <div className="relative">
                <div className="h-32 bg-[#F5F5F5]" />
                <div className="px-6 -mt-12 mb-6 flex justify-between items-end">
                  <img src={profileUser.avatar} className="w-24 h-24 rounded-full border-4 border-white bg-[#EEE]" alt="" />
                  {profileUser.id !== me?.id && (
                    <button 
                      onClick={() => handleFollow(profileUser.id)}
                      className="bg-black text-white px-6 py-2 rounded-full font-bold text-sm hover:bg-[#333] transition-all"
                    >
                      Follow
                    </button>
                  )}
                </div>
                <div className="px-6 mb-8">
                  <h3 className="text-2xl font-bold">{profileUser.firstName} {profileUser.lastName}</h3>
                  <p className="text-[#999] text-sm mb-2">@{profileUser.firstName.toLowerCase()}{profileUser.lastName.toLowerCase()}</p>
                  <p className="text-sm mb-4 leading-relaxed">{profileUser.bio}</p>
                  <div className="flex gap-4 text-sm">
                    <p><span className="font-bold">{profileUser.followingCount}</span> <span className="text-[#999]">Following</span></p>
                    <p><span className="font-bold">{profileUser.followersCount}</span> <span className="text-[#999]">Followers</span></p>
                  </div>
                </div>
                <div className="border-b border-[#EEE] flex">
                  <button className="flex-1 py-4 border-b-2 border-black font-bold text-sm uppercase tracking-widest">Posts</button>
                  <button className="flex-1 py-4 text-[#999] font-bold text-sm uppercase tracking-widest hover:text-black transition-colors">Media</button>
                  <button className="flex-1 py-4 text-[#999] font-bold text-sm uppercase tracking-widest hover:text-black transition-colors">Likes</button>
                </div>
              </div>
            </div>
          )}

          {/* Feed List */}
          {(currentView === "feed" || currentView === "profile" || currentView === "explore") && (
            <div className="divide-y divide-[#EEE]">
              {loading ? (
                <div className="flex justify-center py-20">
                  <RefreshCw className="animate-spin text-[#EEE]" size={32} />
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {statuses.map((status) => (
                    <motion.article
                      key={status.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-6 hover:bg-[#FAFAFA] transition-colors group"
                    >
                      <div className="flex gap-4">
                        <img 
                          src={status.avatar} 
                          className="w-12 h-12 rounded-full bg-[#F5F5F5] cursor-pointer" 
                          alt={status.firstName} 
                          onClick={() => {
                            setSelectedProfileId(status.userId);
                            setCurrentView("profile");
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              className="font-bold hover:underline cursor-pointer"
                              onClick={() => {
                                setSelectedProfileId(status.userId);
                                setCurrentView("profile");
                              }}
                            >
                              {status.firstName} {status.lastName}
                            </span>
                            <span className="text-[#999] text-[10px] bg-[#F5F5F5] px-2 py-0.5 rounded-full font-mono uppercase tracking-tighter">
                              <Countdown date={status.createdAt} />
                            </span>
                            <button 
                              onClick={() => handleFollow(status.userId)}
                              className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] font-bold uppercase tracking-widest text-[#999] hover:text-black transition-all"
                            >
                              Follow
                            </button>
                          </div>
                          
                          <p className="text-[16px] leading-relaxed mb-4 text-[#333]">
                            {status.content}
                          </p>

                          {status.imageUrl && (
                            <div className="mb-4 rounded-2xl overflow-hidden border border-[#EEE]">
                              <img src={status.imageUrl} className="w-full h-auto max-h-[400px] object-cover" alt="" referrerPolicy="no-referrer" />
                            </div>
                          )}

                          {status.repostOfId && (
                            <div className="mb-4 p-4 rounded-2xl border border-[#EEE] bg-white">
                              <p className="text-xs font-bold text-[#999] mb-2 uppercase tracking-widest">{status.origFirstName} {status.origLastName}</p>
                              <p className="text-sm text-[#666] mb-2">{status.origContent}</p>
                              {status.origImageUrl && (
                                <img src={status.origImageUrl} className="w-full h-auto max-h-[200px] object-cover rounded-xl" alt="" referrerPolicy="no-referrer" />
                              )}
                            </div>
                          )}

                          <div className="flex justify-between max-w-sm text-[#999]">
                            <button 
                              onClick={() => {
                                if (expandedComments === status.id) {
                                  setExpandedComments(null);
                                } else {
                                  setExpandedComments(status.id);
                                  fetchComments(status.id);
                                }
                              }}
                              className="flex items-center gap-2 hover:text-black transition-colors"
                            >
                              <MessageCircle size={18} />
                              <span className="text-xs font-bold">Comments</span>
                            </button>
                            
                            <button 
                              onClick={() => setQuotePost(status)}
                              className={`flex items-center gap-2 transition-colors ${status.myInteraction === 'repost' ? 'text-black' : 'hover:text-black'}`}
                            >
                              <Repeat2 size={18} />
                              <span className="text-xs font-bold">{status.repostsCount}</span>
                            </button>

                            <button 
                              onClick={() => handleInteraction(status.id, "like")}
                              className={`flex items-center gap-2 transition-colors ${status.myInteraction === "like" ? "text-black" : "hover:text-black"}`}
                            >
                              <Heart size={18} className={status.myInteraction === "like" ? "fill-black" : ""} />
                              <span className="text-xs font-bold">{status.likes}</span>
                            </button>

                            <button 
                              onClick={() => handleInteraction(status.id, "dislike")}
                              className={`flex items-center gap-2 transition-colors ${status.myInteraction === "dislike" ? "text-black" : "hover:text-black"}`}
                            >
                              <ThumbsDown size={18} className={status.myInteraction === "dislike" ? "fill-black" : ""} />
                              <span className="text-xs font-bold">{status.dislikes}</span>
                            </button>
                          </div>

                          {expandedComments === status.id && (
                            <div className="mt-6 pt-6 border-t border-[#F5F5F5] space-y-4">
                              <div className="flex gap-3">
                                <img src={me?.avatar} className="w-8 h-8 rounded-full bg-[#EEE]" alt="Me" />
                                <div className="flex-1 flex gap-2">
                                  <input 
                                    placeholder="Add a comment..."
                                    className="flex-1 bg-[#F9F9F9] border-none rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-black"
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleComment(status.id)}
                                  />
                                  <button 
                                    onClick={() => handleComment(status.id)}
                                    className="text-xs font-bold uppercase tracking-widest hover:text-black"
                                  >
                                    Send
                                  </button>
                                </div>
                              </div>
                              
                              <div className="space-y-4">
                                {comments.map((comment: any) => (
                                  <div key={comment.id} className="flex gap-3">
                                    <img 
                                      src={comment.avatar} 
                                      className="w-8 h-8 rounded-full bg-[#EEE] cursor-pointer" 
                                      alt="User" 
                                      onClick={() => {
                                        setSelectedProfileId(comment.userId);
                                        setCurrentView("profile");
                                      }}
                                    />
                                    <div className="flex-1">
                                      <p 
                                        className="text-xs font-bold cursor-pointer hover:underline"
                                        onClick={() => {
                                          setSelectedProfileId(comment.userId);
                                          setCurrentView("profile");
                                        }}
                                      >
                                        {comment.firstName} {comment.lastName}
                                      </p>
                                      <p className="text-sm text-[#666]">{comment.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="w-[280px] hidden lg:flex flex-col gap-6 px-6 py-8 sticky top-0 h-screen overflow-y-auto">
          <div className="bg-white p-6 rounded-3xl border border-[#EEE]">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Trending</h3>
            <div className="space-y-4">
              <TrendItem title="Minimalism" posts="2.4k" onClick={() => { setSearchQuery("Minimalism"); setCurrentView("explore"); handleSearch("Minimalism"); }} />
              <TrendItem title="EGO Network" posts="1.1k" onClick={() => { setSearchQuery("EGO Network"); setCurrentView("explore"); handleSearch("EGO Network"); }} />
              <TrendItem title="Architecture" posts="842" onClick={() => { setSearchQuery("Architecture"); setCurrentView("explore"); handleSearch("Architecture"); }} />
            </div>
          </div>

          {suggestedUsers.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-[#EEE]">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Who to follow</h3>
              <div className="space-y-4">
                {suggestedUsers.map(user => (
                  <div key={user.id} className="flex items-center gap-3 group">
                    <img 
                      src={user.avatar} 
                      className="w-10 h-10 rounded-full bg-[#F5F5F5] cursor-pointer" 
                      alt="" 
                      onClick={() => {
                        setSelectedProfileId(user.id);
                        setCurrentView("profile");
                      }}
                    />
                    <div className="flex-1 overflow-hidden">
                      <p 
                        className="font-bold text-sm truncate cursor-pointer hover:underline"
                        onClick={() => {
                          setSelectedProfileId(user.id);
                          setCurrentView("profile");
                        }}
                      >
                        {user.firstName}
                      </p>
                      <p className="text-[10px] text-[#999] truncate">@{user.firstName.toLowerCase()}</p>
                    </div>
                    <button 
                      onClick={() => handleFollow(user.id)}
                      className="text-[10px] font-bold uppercase tracking-widest text-black hover:bg-[#F5F5F5] px-3 py-1 rounded-full border border-[#EEE] transition-all"
                    >
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer group ${active ? "bg-white border border-[#EEE] shadow-sm" : "hover:bg-white/50"}`}
    >
      <div className={active ? "text-black" : "text-[#999] group-hover:text-black"}>
        {icon}
      </div>
      <span className={`text-sm tracking-tight ${active ? "font-bold text-black" : "font-medium text-[#999] group-hover:text-black"}`}>{label}</span>
    </div>
  );
}

function TrendItem({ title, posts, onClick }: { title: string, posts: string, onClick?: () => void }) {
  return (
    <div className="cursor-pointer group" onClick={onClick}>
      <p className="text-xs font-bold text-black group-hover:underline">#{title}</p>
      <p className="text-[10px] font-bold text-[#999] uppercase tracking-widest">{posts} posts</p>
    </div>
  );
}

function Countdown({ date }: { date: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const created = new Date(date + " UTC").getTime();
      const now = new Date().getTime();
      const diff = 180000 - (now - created); // 3 minutes in ms

      if (diff <= 0) {
        setTimeLeft("EXPIRED");
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [date]);

  return <span>{timeLeft}</span>;
}
