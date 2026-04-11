/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { motion } from "motion/react";
import AuthPage from "./components/AuthPage";
import StudentDashboard from "./components/StudentDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import HODDashboard from "./components/HODDashboard";
import AdminDashboard from "./components/AdminDashboard";
import { Toaster } from "@/components/ui/sonner";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, setDoc, getDocFromServer, serverTimestamp } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { LogOut, User as UserIcon, BookOpen } from "lucide-react";
import { toast } from "sonner";

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [userProfile, setUserProfile] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if(error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration. ");
      }
    }
  };

  const fetchUserProfile = async (uid: string) => {
    try {
      // First try to find by UID in users_by_uid mapping
      const mappingRef = doc(db, "users_by_uid", uid);
      let mappingSnap;
      try {
        mappingSnap = await getDoc(mappingRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users_by_uid/${uid}`);
      }
      
      if (mappingSnap && mappingSnap.exists()) {
        const { erpId } = mappingSnap.data();
        const userRef = doc(db, "users", erpId);
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${erpId}`);
        }
        if (userSnap && userSnap.exists()) {
          setUserProfile(userSnap.data());
        }
      } else {
        // Fallback: Search by UID in users collection (for older accounts)
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", uid));
        let querySnapshot;
        try {
          querySnapshot = await getDocs(q);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, "users");
        }
        if (querySnapshot && !querySnapshot.empty) {
          const profile = querySnapshot.docs[0].data();
          setUserProfile(profile);
          
          // Auto-create mapping for security rules
          try {
            await setDoc(doc(db, "users_by_uid", uid), {
              role: profile.role,
              erpId: profile.erpId,
            });
            console.log("Auto-created missing UID mapping for user");
          } catch (e) {
            console.error("Failed to auto-create mapping:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        <Toaster position="top-center" />
      </>
    );
  }

  const renderDashboard = () => {
    if (!userProfile) {
      const isAdminEmail = user.email?.toLowerCase() === "aditiikanade07@gmail.com";
      
      const handleRepairProfile = async () => {
        if (!isAdminEmail) return;
        try {
          const erpId = "ADMIN_001";
          const profileData = {
            uid: user.uid,
            name: user.displayName || "System Admin",
            email: user.email,
            role: "admin",
            erpId: erpId,
            createdAt: serverTimestamp(),
            profileComplete: true
          };
          
          await setDoc(doc(db, "users", erpId), profileData);
          await setDoc(doc(db, "users_by_uid", user.uid), {
            role: "admin",
            erpId: erpId
          });
          
          toast.success("Admin profile initialized! Refreshing...");
          setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
          console.error("Repair error:", error);
          toast.error("Failed to initialize profile.");
        }
      };

      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center">
            <UserIcon className="w-10 h-10 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Profile Not Found</h2>
            <p className="text-muted-foreground max-w-md">
              We couldn't find a profile associated with your account. This might happen if your registration was incomplete or the database was reset.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {isAdminEmail && (
              <Button onClick={handleRepairProfile} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Initialize Admin Profile
              </Button>
            )}
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => signOut(auth)} className="flex-1">
                Sign Out
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="flex-1">
                Refresh
              </Button>
            </div>
          </div>
        </div>
      );
    }

    switch (userProfile.role) {
      case "student":
        return (
          <StudentDashboard 
            user={user} 
            userProfile={userProfile} 
            onProfileUpdate={() => fetchUserProfile(user.uid)} 
          />
        );
      case "teacher":
        return (
          <TeacherDashboard 
            user={user} 
            userProfile={userProfile} 
            onProfileUpdate={() => fetchUserProfile(user.uid)} 
          />
        );
      case "hod":
        return (
          <HODDashboard 
            user={user} 
            userProfile={userProfile} 
            onProfileUpdate={() => fetchUserProfile(user.uid)} 
          />
        );
      case "admin":
        return (
          <AdminDashboard 
            user={user} 
            userProfile={userProfile} 
            onProfileUpdate={() => fetchUserProfile(user.uid)} 
          />
        );
      default:
        return <div>Unknown Role</div>;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" />
              <span className="font-bold text-xl tracking-tight">EduVault</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right mr-4">
                <p className="text-sm font-medium leading-none">{userProfile?.name}</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{userProfile?.role}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowLogoutConfirm(true)}
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderDashboard()}
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-2">
                <LogOut className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold">Confirm Logout</h3>
              <p className="text-muted-foreground">Are you sure you want to log out of your account?</p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1" 
                onClick={() => {
                  signOut(auth);
                  setShowLogoutConfirm(false);
                }}
              >
                Logout
              </Button>
            </div>
          </motion.div>
        </div>
      )}
      
      <Toaster position="top-center" />
    </div>
  );
}
