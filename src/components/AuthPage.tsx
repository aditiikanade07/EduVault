import * as React from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GraduationCap, BookOpen, ShieldCheck, UserCog, Lock, Mail, User, IdCard } from "lucide-react";
import { toast } from "sonner";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp 
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";

type Role = "student" | "teacher" | "admin" | "hod";

export default function AuthPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [role, setRole] = React.useState<Role>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("eduVault_role") as Role) || "student";
    }
    return "student";
  });
  const [activeTab, setActiveTab] = React.useState("login");
  
  // Login states
  const [loginErpId, setLoginErpId] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("eduVault_erpId") || "";
    }
    return "";
  });
  const [loginPassword, setLoginPassword] = React.useState("");

  // Register states
  const [regName, setRegName] = React.useState("");
  const [regEmail, setRegEmail] = React.useState("");
  const [regErpId, setRegErpId] = React.useState("");
  const [regPassword, setRegPassword] = React.useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const rawErpId = loginErpId.trim();
      const upperErpId = rawErpId.toUpperCase();
      
      if (!rawErpId) {
        throw new Error("Please enter your ERP ID.");
      }

      // 1. Find email associated with ERP ID by fetching the document directly
      let userDocSnap;
      try {
        // Try uppercase first (new standard)
        userDocSnap = await getDoc(doc(db, "users", upperErpId));
        
        // If not found and the original input was different, try that too (legacy support)
        if ((!userDocSnap || !userDocSnap.exists()) && upperErpId !== rawErpId) {
          userDocSnap = await getDoc(doc(db, "users", rawErpId));
        }
        
        // If still not found, try lowercase (just in case)
        if ((!userDocSnap || !userDocSnap.exists()) && rawErpId.toLowerCase() !== upperErpId && rawErpId.toLowerCase() !== rawErpId) {
          userDocSnap = await getDoc(doc(db, "users", rawErpId.toLowerCase()));
        }
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          throw new Error("Access denied. Please contact the administrator.");
        }
        handleFirestoreError(error, OperationType.GET, `users/${upperErpId}`);
        throw error;
      }
      
      if (!userDocSnap || !userDocSnap.exists()) {
        throw new Error(`No account found with ERP ID: ${upperErpId}. If you recently remixed this app or the database was reset, please register a new account first.`);
      }

      const userData = userDocSnap.data();
      const email = userData.email;

      // Save the normalized ERP ID to localStorage for next time
      localStorage.setItem("eduVault_erpId", userData.erpId || upperErpId);
      localStorage.setItem("eduVault_role", role);

      // 2. Sign in with Firebase Auth
      await signInWithEmailAndPassword(auth, email, loginPassword);
      toast.success("Login successful!");
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Allow TCET email or the admin email
      const isAdminEmail = regEmail.toLowerCase() === "aditiikanade07@gmail.com";
      if (!regEmail.endsWith("@tcetmumbai.in") && !isAdminEmail) {
        throw new Error("Please use your official @tcetmumbai.in email or register as an authorized admin.");
      }

      if (regPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      const trimmedErpId = regErpId.trim().toUpperCase();
      if (!trimmedErpId) {
        throw new Error("Please enter a valid ERP ID.");
      }

      // Check if ERP ID already exists
      let checkDoc;
      try {
        checkDoc = await getDoc(doc(db, "users", trimmedErpId));
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, `users/${trimmedErpId}`);
      }
      if (checkDoc && checkDoc.exists()) {
        throw new Error("An account with this ERP ID already exists. Please login.");
      }

      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      const user = userCredential.user;

      // 2. Create user profile in Firestore using ERP ID as the document ID
      // This allows unauthenticated lookup by ERP ID for login
      try {
        await setDoc(doc(db, "users", trimmedErpId), {
          uid: user.uid,
          name: regName,
          email: regEmail,
          role: role,
          erpId: trimmedErpId,
          createdAt: serverTimestamp(),
        });
      } catch (error: any) {
        handleFirestoreError(error, OperationType.WRITE, `users/${trimmedErpId}`);
        throw error;
      }

      // 3. Also create a mapping by UID for security rules to check roles
      try {
        await setDoc(doc(db, "users_by_uid", user.uid), {
          role: role,
          erpId: trimmedErpId,
        });
      } catch (error: any) {
        handleFirestoreError(error, OperationType.WRITE, `users_by_uid/${user.uid}`);
      }

      // 4. Sign out (since createUserWithEmailAndPassword logs them in automatically)
      await signOut(auth);

      toast.success("Registration successful! Please login with your ERP ID.");
      
      // 5. Reset registration fields and switch to login tab
      setRegName("");
      setRegEmail("");
      setRegErpId("");
      setRegPassword("");
      setActiveTab("login");
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.code === 'auth/email-already-in-use') {
        const trimmedErpId = regErpId.trim().toUpperCase();
        // Check if the profile is missing in Firestore even if Auth exists
        try {
          const checkDoc = await getDoc(doc(db, "users", trimmedErpId));
          if (!checkDoc.exists()) {
            toast.info("Account exists in Auth but profile is missing. Attempting to repair...");
            // We can't easily repair without signing in, so just tell them to contact admin or try a different ERP ID
            toast.error("This email is registered but linked to a different ERP ID or profile is corrupted.");
          } else {
            toast.error("This email is already registered. Please login instead.");
          }
        } catch (e) {
          toast.error("This email is already registered.");
        }
      } else if (error.code === 'auth/invalid-email') {
        toast.error("Invalid email address.");
      } else if (error.code === 'auth/weak-password') {
        toast.error("Password is too weak.");
      } else {
        toast.error(error.message || "Registration failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const roleIcons = {
    student: <GraduationCap className="w-5 h-5" />,
    teacher: <BookOpen className="w-5 h-5" />,
    admin: <ShieldCheck className="w-5 h-5" />,
    hod: <UserCog className="w-5 h-5" />,
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm mb-4 border border-gray-100">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">EduVault</h1>
          <p className="text-muted-foreground mt-2">Centralized Question Bank Portal</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
            <div className="mt-0.5">
              {role === "student" && <GraduationCap className="w-4 h-4 text-blue-600" />}
              {role === "teacher" && <BookOpen className="w-4 h-4 text-blue-600" />}
              {role === "hod" && <UserCog className="w-4 h-4 text-blue-600" />}
              {role === "admin" && <ShieldCheck className="w-4 h-4 text-blue-600" />}
            </div>
            <div className="text-xs text-blue-800">
              <span className="font-semibold block mb-0.5 capitalize">{role} Access</span>
              {role === "student" && "Access question banks, previous year papers, and study materials."}
              {role === "teacher" && "Manage subject-wise question banks, map topics, and upload exam metadata."}
              {role === "hod" && "Monitor department-wise question repositories and analyze faculty contributions."}
              {role === "admin" && "Full system control, user management, and platform configuration."}
            </div>
          </div>

          <TabsContent value="login">
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Welcome Back</CardTitle>
                <CardDescription>
                  Enter your credentials to access the repository.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Select Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                      <SelectTrigger id="role" className="bg-white">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>Student</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="teacher">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span>Teacher</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="hod">
                          <div className="flex items-center gap-2">
                            <UserCog className="w-4 h-4" />
                            <span>HOD</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Admin</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="erpId">ERP ID</Label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="erpId"
                        placeholder="Enter your ERP ID"
                        className="pl-10 bg-white"
                        value={loginErpId}
                        onChange={(e) => setLoginErpId(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 bg-white"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" type="submit" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Login"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>
                  Join the platform to access and manage question banks.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleRegister}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-role">Select Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                      <SelectTrigger id="reg-role" className="bg-white">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>Student</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="teacher">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <span>Teacher</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="hod">
                          <div className="flex items-center gap-2">
                            <UserCog className="w-4 h-4" />
                            <span>HOD</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Admin</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        placeholder="John Doe"
                        className="pl-10 bg-white"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-erpId">ERP ID</Label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reg-erpId"
                        placeholder="Enter your ERP ID"
                        className="pl-10 bg-white"
                        value={regErpId}
                        onChange={(e) => setRegErpId(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">TCET Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="john.doe@tcetmumbai.in"
                        className="pl-10 bg-white"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Create Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reg-password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 bg-white"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground px-1">
                      Must be at least 6 characters long.
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" type="submit" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Register"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground mt-8">
          © 2026 TCET Examination Department. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
