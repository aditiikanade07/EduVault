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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserCog, BarChart3, Users, ShieldCheck, FileCheck, Settings, CheckCircle2, XCircle, ExternalLink, FileText, BookOpen, Link as LinkIcon } from "lucide-react";
import { doc, updateDoc, collection, query, where, getDocs, orderBy, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { toast } from "sonner";

interface HODDashboardProps {
  user: any;
  userProfile: any;
  onProfileUpdate: () => void;
}

type HODView = "main" | "approvals" | "faculty" | "analytics";

export default function HODDashboard({ user, userProfile, onProfileUpdate }: HODDashboardProps) {
  const [activeView, setActiveView] = React.useState<HODView>("main");
  const [department, setDepartment] = React.useState(userProfile?.department || "");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [pendingResources, setPendingResources] = React.useState<any[]>([]);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);

  const isProfileComplete = !!userProfile?.department;

  const fetchPendingResources = async () => {
    if (!userProfile?.department) return;
    setIsLoadingPending(true);
    try {
      const q = query(
        collection(db, "academic_resources"),
        where("department", "==", userProfile.department),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      setPendingResources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching pending resources:", error);
      // If it's a missing index error, we might need to handle it or just log it
    } finally {
      setIsLoadingPending(false);
    }
  };

  React.useEffect(() => {
    fetchPendingResources();
  }, [userProfile?.department]);

  React.useEffect(() => {
    if (activeView === "approvals") {
      fetchPendingResources();
    }
  }, [activeView]);

  const handleApprove = async (resourceId: string) => {
    try {
      await updateDoc(doc(db, "academic_resources", resourceId), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: user.uid
      });
      toast.success("Resource approved!");
      fetchPendingResources();
    } catch (error) {
      console.error("Error approving resource:", error);
      toast.error("Failed to approve resource");
    }
  };

  const handleReject = async (resourceId: string) => {
    if (!confirm("Are you sure you want to reject and delete this resource?")) return;
    try {
      await deleteDoc(doc(db, "academic_resources", resourceId));
      toast.success("Resource rejected and deleted");
      fetchPendingResources();
    } catch (error) {
      console.error("Error rejecting resource:", error);
      toast.error("Failed to reject resource");
    }
  };

  const handleSaveProfile = async () => {
    if (!department) {
      toast.error("Please select your department");
      return;
    }

    setIsUpdating(true);
    try {
      const erpId = userProfile.erpId;
      const userDocRef = doc(db, "users", erpId);
      
      await updateDoc(userDocRef, {
        department,
        profileComplete: true
      });

      toast.success("Profile updated successfully!");
      onProfileUpdate();
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isProfileComplete) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="border-none shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <UserCog className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">HOD Onboarding</CardTitle>
              <CardDescription>
                Select your department to oversee question banks and faculty contributions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {["ES AND H", "IOT", "COMPUTER", "CIVIL", "MECHANICAL", "EXTC", "ENCS"].map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={handleSaveProfile} 
                disabled={isUpdating}
              >
                {isUpdating ? "Saving..." : "Enter Dashboard"}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (activeView === "approvals") {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => setActiveView("main")} className="mb-2">
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
            <p className="text-muted-foreground">Review and approve academic materials for {userProfile.department}</p>
          </div>
        </header>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Resource Queue</CardTitle>
            <CardDescription>Materials waiting for your verification</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPending ? (
              <div className="py-12 text-center">Loading pending resources...</div>
            ) : pendingResources.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground italic">No pending approvals at this time.</div>
            ) : (
              <div className="space-y-4">
                {pendingResources.map((res) => (
                  <div key={res.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-100 shadow-sm">
                        {res.category === "qb" ? <FileText className="text-blue-500" /> : 
                         res.category === "pyq" ? <FileCheck className="text-purple-500" /> :
                         res.category === "library" ? <BookOpen className="text-emerald-500" /> :
                         <LinkIcon className="text-indigo-500" />}
                      </div>
                      <div>
                        <h3 className="font-bold">{res.title}</h3>
                        <p className="text-sm text-muted-foreground uppercase font-medium">
                          {res.category === "qb" ? "Question Bank" : 
                           res.category === "pyq" ? "Previous Year Paper" :
                           res.category === "library" ? "Digital Library" : "Resource"} • {res.subject}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full">Year {res.year}</span>
                          <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full">Div {res.division}</span>
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">By {res.teacherName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={res.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" /> View File
                        </a>
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(res.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleReject(res.id)}>
                        <XCircle className="w-4 h-4 mr-2" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">HOD Dashboard</h1>
          <p className="text-muted-foreground">
            Head of Department • {userProfile.department}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onProfileUpdate()}>
            Edit Profile
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <BarChart3 className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Monitor repository growth and usage</CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <Users className="w-8 h-8 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Faculty Contributions</CardTitle>
            <CardDescription>Review uploads by department teachers</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("approvals")}
        >
          <CardHeader>
            <FileCheck className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Approvals</CardTitle>
            <CardDescription>Verify and approve new question banks</CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <ShieldCheck className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Quality Control</CardTitle>
            <CardDescription>Audit question quality and mapping</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Department Overview</CardTitle>
            <CardDescription>Status of subject repositories in {userProfile.department}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Settings className="w-6 h-6 text-gray-300" />
              </div>
              <p>No department data available yet.</p>
              <p className="text-sm">Data will appear as teachers start contributing.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Department Stats</CardTitle>
            <CardDescription>Quick metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Active Teachers</span>
              <span className="text-xl font-bold text-primary">0</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Total Questions</span>
              <span className="text-xl font-bold text-primary">0</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Pending Reviews</span>
              <span className="text-xl font-bold text-primary">{pendingResources.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
