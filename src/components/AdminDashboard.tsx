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
import { ShieldCheck, Users, Database, Settings, Activity, Lock, FileText, ChevronLeft, BookOpen, Search, ExternalLink } from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

interface AdminDashboardProps {
  user: any;
  userProfile: any;
  onProfileUpdate: () => void;
}

const DEPARTMENTS = ["COMP", "IOT", "EXTC", "ENTC", "MECH", "CIVIL", "ENCS", "ES AND H"];
const YEARS = ["1", "2", "3", "4"];
const SEMESTERS = ["1", "2"];
const DIVISIONS = ["A", "B", "C", "D", "E", "F", "G"];

export default function AdminDashboard({ user, userProfile, onProfileUpdate }: AdminDashboardProps) {
  const [activeView, setActiveView] = React.useState<"main" | "exams">("main");
  const [selectedDept, setSelectedDept] = React.useState("");
  const [selectedYear, setSelectedYear] = React.useState("");
  const [selectedSem, setSelectedSem] = React.useState("");
  const [pyqFiles, setPyqFiles] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchPYQs = async () => {
    if (!selectedDept || !selectedYear || !selectedSem) {
      toast.error("Please select all filters");
      return;
    }

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "academic_resources"),
        where("department", "==", selectedDept),
        where("year", "==", selectedYear),
        where("semester", "==", selectedSem),
        where("category", "==", "pyq"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      setPyqFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching PYQs:", error);
      toast.error("Failed to load PYQs");
    } finally {
      setIsLoading(false);
    }
  };

  if (activeView === "exams") {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => setActiveView("main")} className="mb-2 gap-2">
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Exam Repository</h1>
            <p className="text-muted-foreground">Access and manage uploaded Previous Year Question papers</p>
          </div>
        </header>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Filter PYQs</CardTitle>
            <CardDescription>Select criteria to find specific exam papers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Dept" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map(year => (
                      <SelectItem key={year} value={year}>Year {year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={selectedSem} onValueChange={setSelectedSem}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Sem" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map(sem => (
                      <SelectItem key={sem} value={sem}>Sem {sem}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full mt-6 gap-2" onClick={fetchPYQs} disabled={isLoading}>
              <Search className="w-4 h-4" />
              {isLoading ? "Searching..." : "Search Papers"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pyqFiles.length === 0 && !isLoading ? (
            <div className="col-span-full py-20 text-center text-muted-foreground bg-white rounded-xl border border-dashed">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No papers found for the selected criteria.</p>
            </div>
          ) : (
            pyqFiles.map((file) => (
              <Card key={file.id} className="border-none shadow-sm bg-white hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  </div>
                  <CardTitle className="text-lg mt-4">{file.title}</CardTitle>
                  <CardDescription className="uppercase font-medium text-xs">{file.subject}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">Dept: {file.department}</span>
                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">Sem: {file.semester}</span>
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">By {file.teacherName}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Administration</h1>
          <p className="text-muted-foreground">
            Full Platform Control • {userProfile.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            System Logs
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <Users className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>User Management</CardTitle>
            <CardDescription>Manage students, teachers, and HODs</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("exams")}
        >
          <CardHeader>
            <FileText className="w-8 h-8 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Exam Repository</CardTitle>
            <CardDescription>Access and verify PYQ papers</CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <Database className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Data Maintenance</CardTitle>
            <CardDescription>Backup and optimize question repositories</CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <Lock className="w-8 h-8 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Access Control</CardTitle>
            <CardDescription>Manage roles and system permissions</CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white">
          <CardHeader>
            <Settings className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle>Global Settings</CardTitle>
            <CardDescription>Configure platform-wide parameters</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>System Health</CardTitle>
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
            <CardDescription>Real-time platform performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Database Load</span>
                  <span className="font-medium text-emerald-600">Optimal</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[15%]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Storage Usage</span>
                  <span className="font-medium text-blue-600">2.4 GB / 50 GB</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[5%]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Active Sessions</span>
                  <span className="font-medium text-purple-600">12 Users Online</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 w-[25%]" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common admin tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2">
              <ShieldCheck className="w-4 h-4" />
              Verify New Faculty
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Database className="w-4 h-4" />
              Export Database
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Settings className="w-4 h-4" />
              Update Terms of Service
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
