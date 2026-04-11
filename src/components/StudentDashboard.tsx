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
import { GraduationCap, BookOpen, Layers, Calendar, Link as LinkIcon, HelpCircle, CheckCircle2, XCircle, ChevronLeft, UserCheck, UserCog, Settings, FileText, ExternalLink } from "lucide-react";
import { doc, updateDoc, collection, addDoc, setDoc, getDocs, query, where, serverTimestamp, getDoc, limit, onSnapshot, deleteDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

interface StudentDashboardProps {
  user: any;
  userProfile: any;
  onProfileUpdate: () => void;
}

const FIRST_YEAR_SUBJECTS: Record<string, string[]> = {
  "1": ["Physics", "Maths", "EGD", "EGPC", "BEE"],
  "2": ["Chemistry", "Maths", "EM", "IIKS", "PPS"]
};

const IOT_SUBJECTS: Record<string, Record<string, string[]>> = {
  "SECOND YEAR": {
    "1": ["IoT Foundations", "Sensing", "Actuation", "Comm Protocols", "M2M", "Sensor Networks"],
    "2": ["Programming & Hardware", "CS Foundations", "Maths & Analytics", "Specialized Topics"]
  },
  "THIRD YEAR": {
    "1": ["Advanced Embedded Systems", "Networking", "Data Analysis"],
    "2": ["Cloud & Application", "Electives & Projects", "Soft Skills", "AI/ML"]
  },
  "FOURTH YEAR": {
    "1": ["IoT Security", "RTOS"],
    "2": ["Data Analytics for IoT", "Deep Learning", "Cryptography"]
  }
};

const COMP_SUBJECTS: Record<string, Record<string, string[]>> = {
  "SECOND YEAR": {
    "1": ["Data Structures", "OOP"],
    "2": ["DBMS", "COA", "Analysis of Algorithms", "TCS"]
  },
  "THIRD YEAR": {
    "1": ["DBMS", "Computer Networks", "Operating Systems"],
    "2": ["Theory of Computation", "DAA", "Artificial Intelligence"]
  },
  "FOURTH YEAR": {
    "1": ["Foundational Eng", "Core Computing"],
    "2": ["AI", "Cyber Security", "Cloud Computing"]
  }
};

const CIVIL_SUBJECTS: Record<string, Record<string, string[]>> = {
  "SECOND YEAR": {
    "1": ["Strength of Materials", "Fluid Mechanics", "Surveying"],
    "2": ["Building Materials & Construction", "Structural Analysis"]
  },
  "THIRD YEAR": {
    "1": ["Structural Analysis-II", "Geotechnical Engineering-II", "Environmental Engineering-I"],
    "2": ["Environmental Engineering-II", "Transportation Engineering-II", "Water Resources Engineering"]
  },
  "FOURTH YEAR": {
    "1": ["Structural Design", "Environmental Engineering", "Foundation Engineering"],
    "2": ["Transportation Prof Electives", "Construction Technology"]
  }
};

const EXTC_SUBJECTS: Record<string, Record<string, string[]>> = {
  "SECOND YEAR": {
    "1": ["Maths-III", "EDC-I", "DSD"],
    "2": ["Circuit Theory & Networks", "EIC"]
  },
  "THIRD YEAR": {
    "1": ["Analog Communication", "Integrated Circuits"],
    "2": ["Microcontrollers", "Digital Communication", "Signal Processing"]
  },
  "FOURTH YEAR": {
    "1": ["Image & Video Processing", "Mobile Communication"],
    "2": ["Microwave & Radar Eng", "Optical Comm & Networks"]
  }
};

const DEPT_CONFIG: Record<string, { years: string[], divisions: string[] }> = {
  "COMP": {
    years: ["1", "2", "3", "4"],
    divisions: ["A", "B", "C", "D", "E"]
  },
  "IOT": {
    years: ["1", "2", "3", "4"],
    divisions: ["A", "B"]
  },
  "ENCS": {
    years: ["1", "2", "3", "4"],
    divisions: ["A"]
  },
  "EXTC": {
    years: ["1", "2", "3", "4"],
    divisions: ["A", "B"]
  },
  "ENTC": {
    years: ["1", "2", "3", "4"],
    divisions: ["A"]
  },
  "CIVIL": {
    years: ["1", "2", "3", "4"],
    divisions: ["A"]
  },
  "MECHANICAL": {
    years: ["1", "2", "3", "4"],
    divisions: ["A"]
  }
};

export default function StudentDashboard({ user, userProfile, onProfileUpdate }: StudentDashboardProps) {
  const [department, setDepartment] = React.useState(userProfile?.department || "");
  const [academicYear, setAcademicYear] = React.useState(userProfile?.academicYear || "");
  const [semester, setSemester] = React.useState(userProfile?.semester || "");
  const [division, setDivision] = React.useState(userProfile?.division || "");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = React.useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = React.useState<any | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = React.useState(false);
  const [approvalResult, setApprovalResult] = React.useState<any | null>(null);

  // Files State
  const [qbFiles, setQbFiles] = React.useState<any[]>([]);
  const [pyqFiles, setPyqFiles] = React.useState<any[]>([]);
  const [libraryFiles, setLibraryFiles] = React.useState<any[]>([]);
  const [resourceFiles, setResourceFiles] = React.useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = React.useState(false);

  // Quiz State
  const [quizzes, setQuizzes] = React.useState<any[]>([]);
  const [completedQuizzes, setCompletedQuizzes] = React.useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = React.useState<any | null>(null);
  const [quizAnswers, setQuizAnswers] = React.useState<Record<number, number>>({});
  const [isSubmittingQuiz, setIsSubmittingQuiz] = React.useState(false);
  const [quizResult, setQuizResult] = React.useState<any | null>(null);

  // Attendance State
  const [attendanceRecords, setAttendanceRecords] = React.useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = React.useState({ present: 0, total: 0, percentage: 0 });
  const [isLoadingAttendance, setIsLoadingAttendance] = React.useState(false);

  const fetchQuizzes = async () => {
    if (!userProfile?.department || !userProfile?.academicYear || !userProfile?.division) return;
    
    const yearMap: Record<string, string> = {
      "FIRST YEAR": "1",
      "SECOND YEAR": "2",
      "THIRD YEAR": "3",
      "FOURTH YEAR": "4"
    };

    try {
      const classId = `${yearMap[userProfile.academicYear]}_${userProfile.division}`;
      const quizCollectionRef = collection(db, "departments", userProfile.department, "classes", classId, "quizzes");
      
      const querySnapshot = await getDocs(quizCollectionRef);
      const quizList = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((q: any) => !q.semester || q.semester === userProfile.semester);
      
      const available: any[] = [];
      const completed: any[] = [];

      for (const quiz of quizList) {
        const scoreDocRef = doc(db, "departments", userProfile.department, "classes", classId, "quizzes", quiz.id, "scores", user.uid);
        const scoreSnap = await getDoc(scoreDocRef);
        if (scoreSnap.exists()) {
          completed.push({
            ...quiz,
            result: scoreSnap.data()
          });
        } else {
          available.push(quiz);
        }
      }
      
      setQuizzes(available);
      setCompletedQuizzes(completed);
    } catch (error) {
      console.error("Error fetching quizzes:", error);
    }
  };

  React.useEffect(() => {
    if (!user.uid) return;

    const q = query(
      collection(db, "profile_requests"),
      where("studentId", "==", user.uid),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const requestData = { id: doc.id, ...(doc.data() as any) };
        
        if (requestData.status === "pending") {
          setPendingRequest(requestData);
        } else {
          // It's approved or denied
          setApprovalResult(requestData);
          setPendingRequest(null);
          
          // If approved, refresh profile
          if (requestData.status === "approved") {
            onProfileUpdate();
          }
        }
      } else {
        setPendingRequest(null);
      }
      setIsLoadingRequest(false);
    }, (error) => {
      console.error("Error listening to profile requests:", error);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleAcknowledgeApproval = async () => {
    if (!approvalResult) return;
    try {
      await deleteDoc(doc(db, "profile_requests", approvalResult.id));
      setApprovalResult(null);
    } catch (error) {
      console.error("Error deleting request:", error);
      setApprovalResult(null);
    }
  };

  const fetchAttendance = async () => {
    if (!userProfile?.department || !userProfile?.academicYear || !userProfile?.division) return;
    
    setIsLoadingAttendance(true);
    const yearMap: Record<string, string> = {
      "FIRST YEAR": "1",
      "SECOND YEAR": "2",
      "THIRD YEAR": "3",
      "FOURTH YEAR": "4"
    };

    try {
      const classId = `${yearMap[userProfile.academicYear]}_${userProfile.division}`;
      const attendanceRef = collection(db, "departments", userProfile.department, "classes", classId, "attendance");
      const querySnapshot = await getDocs(attendanceRef);
      
      const studentAttendance: any[] = [];
      let presentCount = 0;
      
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const myRecord = data.records?.find((r: any) => r.erpId === userProfile.erpId);
        if (myRecord) {
          studentAttendance.push({
            id: doc.id,
            date: data.date,
            present: myRecord.present,
            teacherName: data.teacherName
          });
          if (myRecord.present) presentCount++;
        }
      });

      // Sort by date descending
      studentAttendance.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setAttendanceRecords(studentAttendance);
      const total = studentAttendance.length;
      setAttendanceStats({
        present: presentCount,
        total,
        percentage: total > 0 ? Math.round((presentCount / total) * 100) : 0
      });
    } catch (error) {
      console.error("Error fetching attendance:", error);
      toast.error("Failed to load attendance records");
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  const fetchFiles = async () => {
    if (!userProfile?.department || !userProfile?.academicYear || !userProfile?.division || !selectedCategory || !selectedSubject) return;
    
    setIsLoadingFiles(true);
    const yearMap: Record<string, string> = {
      "FIRST YEAR": "1",
      "SECOND YEAR": "2",
      "THIRD YEAR": "3",
      "FOURTH YEAR": "4"
    };

    try {
      const classId = `${yearMap[userProfile.academicYear]}_${userProfile.division}`;
      const category = selectedCategory === "textbooks" ? "library" : selectedCategory;
      
      const q = query(
        collection(db, "academic_resources"), 
        where("classId", "==", classId),
        where("category", "==", category),
        where("subject", "==", selectedSubject),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const fileList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (selectedCategory === "qb") setQbFiles(fileList);
      else if (selectedCategory === "pyq") setPyqFiles(fileList);
      else if (selectedCategory === "textbooks") setLibraryFiles(fileList);
      else if (selectedCategory === "resources") setResourceFiles(fileList);
      
    } catch (error) {
      console.error("Error fetching files:", error);
      toast.error("Failed to load files");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  React.useEffect(() => {
    if (selectedCategory && selectedSubject && ["qb", "pyq", "textbooks", "resources"].includes(selectedCategory)) {
      fetchFiles();
    }
  }, [selectedCategory, selectedSubject]);

  React.useEffect(() => {
    if (selectedCategory === "quizzes") {
      fetchQuizzes();
    } else if (selectedCategory === "attendance") {
      fetchAttendance();
    }
  }, [selectedCategory]);

  const handleSubmitQuiz = async () => {
    if (Object.keys(quizAnswers).length < activeQuiz.questions.length) {
      toast.error("Please answer all questions");
      return;
    }

    setIsSubmittingQuiz(true);
    let score = 0;
    activeQuiz.questions.forEach((q: any, index: number) => {
      if (quizAnswers[index] === q.correctAnswer) {
        score++;
      }
    });

    try {
      const yearMap: Record<string, string> = {
        "FIRST YEAR": "1",
        "SECOND YEAR": "2",
        "THIRD YEAR": "3",
        "FOURTH YEAR": "4"
      };
      const classId = `${yearMap[userProfile.academicYear]}_${userProfile.division}`;
      const scoreDocRef = doc(db, "departments", userProfile.department, "classes", classId, "quizzes", activeQuiz.id, "scores", user.uid);

      await setDoc(scoreDocRef, {
        quizId: activeQuiz.id,
        quizTitle: activeQuiz.title,
        studentId: user.uid,
        studentName: userProfile.name,
        erpId: userProfile.erpId,
        score,
        total: activeQuiz.questions.length,
        submittedAt: serverTimestamp()
      });

      const result = { score, total: activeQuiz.questions.length };
      setQuizResult(result);
      setCompletedQuizzes(prev => [...prev, { ...activeQuiz, result }]);
      setQuizzes(prev => prev.filter(q => q.id !== activeQuiz.id));
      toast.success("Quiz submitted successfully!");
    } catch (error) {
      console.error("Error submitting quiz:", error);
      toast.error("Failed to submit quiz");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const isProfileComplete = userProfile?.department && userProfile?.academicYear && userProfile?.semester && userProfile?.division;

  const getAvailableDivisions = (dept: string) => {
    return DEPT_CONFIG[dept]?.divisions || ["A", "B", "C", "D", "E", "F", "G"];
  };

  const handleSaveProfile = async () => {
    if (!department || !academicYear || !semester || !division) {
      toast.error("Please fill all fields");
      return;
    }

    setIsUpdating(true);
    try {
      const erpId = userProfile.erpId;
      const userDocRef = doc(db, "users", erpId);
      
      // If profile is already complete, this is a change request
      if (userProfile.profileComplete) {
        await addDoc(collection(db, "profile_requests"), {
          studentId: user.uid,
          studentName: userProfile.name,
          erpId: userProfile.erpId,
          currentDetails: {
            department: userProfile.department,
            academicYear: userProfile.academicYear,
            semester: userProfile.semester,
            division: userProfile.division
          },
          requestedDetails: {
            department,
            academicYear,
            semester,
            division
          },
          status: "pending",
          createdAt: serverTimestamp()
        });
        toast.success("Change request sent for teacher approval!");
      } else {
        // Initial setup - no approval needed
        await updateDoc(userDocRef, {
          department,
          academicYear,
          semester,
          division,
          profileComplete: true
        });
        toast.success("Profile updated successfully!");
        onProfileUpdate();
      }
      
      setIsEditing(false);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
  };

  const getSubjects = () => {
    const year = userProfile.academicYear;
    const sem = userProfile.semester;
    const dept = userProfile.department;

    if (year === "FIRST YEAR") {
      return FIRST_YEAR_SUBJECTS[sem] || [];
    }

    if (dept === "IOT") {
      return IOT_SUBJECTS[year]?.[sem] || [];
    }

    if (dept === "COMP") {
      return COMP_SUBJECTS[year]?.[sem] || [];
    }

    if (dept === "CIVIL") {
      return CIVIL_SUBJECTS[year]?.[sem] || [];
    }

    if (dept === "EXTC") {
      return EXTC_SUBJECTS[year]?.[sem] || [];
    }

    return ["Core Subject 1", "Core Subject 2", "Elective 1"];
  };

  if (!isProfileComplete || isEditing) {
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
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">{isEditing ? "Update Profile" : "Complete Your Profile"}</CardTitle>
              <CardDescription>
                {isEditing ? "Modify your academic details below." : "Please provide your academic details to access relevant question banks."}
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
                    {["COMP", "IOT", "ENCS", "EXTC", "ENTC", "CIVIL", "MECHANICAL"].map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={academicYear} onValueChange={setAcademicYear}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {["FIRST YEAR", "SECOND YEAR", "THIRD YEAR", "FOURTH YEAR"].map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={division} onValueChange={setDivision} disabled={!department}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Division" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableDivisions(department).map((div) => (
                      <SelectItem key={div} value={div}>{div}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              {isEditing && (
                <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button 
                className={isEditing ? "flex-1" : "w-full"} 
                onClick={handleSaveProfile} 
                disabled={isUpdating}
              >
                {isUpdating ? "Saving..." : isEditing ? "Update" : "Access Dashboard"}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (activeQuiz) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => {
            setActiveQuiz(null);
            setQuizAnswers({});
            setQuizResult(null);
          }} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Exit Quiz
          </Button>
          <div className="bg-primary/10 px-4 py-1 rounded-full text-primary font-bold">
            {activeQuiz.title}
          </div>
        </div>

        {quizResult ? (
          <Card className="max-w-md mx-auto text-center p-8 space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Quiz Completed!</h2>
              <p className="text-muted-foreground">Your score has been recorded.</p>
            </div>
            <div className="text-5xl font-black text-primary">
              {quizResult.score} / {quizResult.total}
            </div>
            <Button className="w-full" onClick={() => {
              setActiveQuiz(null);
              setQuizAnswers({});
              setQuizResult(null);
            }}>
              Back to Dashboard
            </Button>
          </Card>
        ) : (
          <div className="max-w-2xl mx-auto space-y-8">
            {activeQuiz.questions.map((q: any, index: number) => (
              <Card key={index} className="overflow-hidden border-none shadow-sm">
                <CardHeader className="bg-gray-50/50 border-b">
                  <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <p className="text-lg font-medium">{q.question}</p>
                  <div className="grid grid-cols-1 gap-3">
                    {q.options.map((opt: string, oIndex: number) => (
                      <Button
                        key={oIndex}
                        variant={quizAnswers[index] === oIndex ? "default" : "outline"}
                        className={`justify-start h-auto py-4 px-6 text-left ${quizAnswers[index] === oIndex ? "ring-2 ring-primary ring-offset-2" : ""}`}
                        onClick={() => setQuizAnswers({ ...quizAnswers, [index]: oIndex })}
                      >
                        <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-4 text-xs font-bold shrink-0 group-hover:bg-primary/20">
                          {String.fromCharCode(65 + oIndex)}
                        </span>
                        {opt}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button className="w-full h-14 text-lg font-bold" onClick={handleSubmitQuiz} disabled={isSubmittingQuiz}>
              {isSubmittingQuiz ? "Submitting..." : "Submit Quiz"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black tracking-tight text-gray-900">
              {userProfile.name}
            </h2>
            {pendingRequest && (
              <div className="flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full w-fit">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                Change Request Pending Approval
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsEditing(true)}
            disabled={!!pendingRequest}
          >
            <UserCog className="w-4 h-4 mr-2" />
            {pendingRequest ? "Request Pending" : "Change Academic Details"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onProfileUpdate()}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {pendingRequest && (
        <Card className="mb-8 border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-orange-800 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Pending Academic Change Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-orange-700">
              You have requested to change your details to:
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="bg-white px-2 py-1 rounded border border-orange-100 font-mono text-[10px]">
                  {pendingRequest.requestedDetails.department}
                </span>
                <span className="bg-white px-2 py-1 rounded border border-orange-100 font-mono text-[10px]">
                  {pendingRequest.requestedDetails.academicYear}
                </span>
                <span className="bg-white px-2 py-1 rounded border border-orange-100 font-mono text-[10px]">
                  Sem {pendingRequest.requestedDetails.semester}
                </span>
                <span className="bg-white px-2 py-1 rounded border border-orange-100 font-mono text-[10px]">
                  Div {pendingRequest.requestedDetails.division}
                </span>
              </div>
              <p className="mt-2 text-[10px] opacity-70 italic">
                A teacher will review and approve your request soon.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "attendance" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("attendance");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <UserCheck className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "attendance" ? "text-primary" : "text-emerald-500"}`} />
            <CardTitle className="text-sm">Attendance</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Track your presence</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "qb" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("qb");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <BookOpen className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "qb" ? "text-primary" : "text-blue-500"}`} />
            <CardTitle className="text-sm">Question Banks</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Subject-wise repositories</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "quizzes" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("quizzes");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <HelpCircle className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "quizzes" ? "text-primary" : "text-pink-500"}`} />
            <CardTitle className="text-sm">Active Quizzes</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Take class tests</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "pyq" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("pyq");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <Layers className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "pyq" ? "text-primary" : "text-purple-500"}`} />
            <CardTitle className="text-sm">PYQ Papers</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Exam paper archives</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "textbooks" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("textbooks");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <BookOpen className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "textbooks" ? "text-primary" : "text-emerald-500"}`} />
            <CardTitle className="text-sm">Online Textbooks</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Digital reference books</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "resources" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("resources");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <LinkIcon className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "resources" ? "text-primary" : "text-indigo-500"}`} />
            <CardTitle className="text-sm">Resource Links</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">External learning materials</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`hover:shadow-md transition-all cursor-pointer group ${selectedCategory === "meta" ? "ring-2 ring-primary bg-primary/5" : ""}`}
          onClick={() => {
            setSelectedCategory("meta");
            setSelectedSubject(null);
          }}
        >
          <CardHeader className="p-4">
            <Calendar className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${selectedCategory === "meta" ? "text-primary" : "text-orange-500"}`} />
            <CardTitle className="text-sm">Exam Metadata</CardTitle>
            <CardDescription className="text-[10px] line-clamp-1">Weightage & mapping</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {selectedCategory && (
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <h2 className="text-xl font-bold">
              {selectedCategory === "qb" && "Select Subject for Question Bank"}
              {selectedCategory === "pyq" && "Select Subject for Previous Year Papers"}
              {selectedCategory === "textbooks" && "Select Subject for Online Textbooks"}
              {selectedCategory === "resources" && "Select Subject for Resource Materials"}
              {selectedCategory === "meta" && "Select Subject for Metadata"}
              {selectedCategory === "quizzes" && "Available Quizzes for Your Class"}
              {selectedCategory === "attendance" && "Your Attendance Records"}
            </h2>
          </div>

          {selectedCategory === "attendance" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white border-none shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Overall Attendance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-primary">{attendanceStats.percentage}%</span>
                      <span className="text-sm text-muted-foreground">Target: 75%</span>
                    </div>
                    <div className="mt-4 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${attendanceStats.percentage >= 75 ? "bg-emerald-500" : "bg-orange-500"}`}
                        style={{ width: `${attendanceStats.percentage}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Lectures</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{attendanceStats.total}</div>
                    <p className="text-xs text-muted-foreground mt-1">Conducted so far</p>
                  </CardContent>
                </Card>

                <Card className="bg-white border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Lectures Attended</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-emerald-600">{attendanceStats.present}</div>
                    <p className="text-xs text-muted-foreground mt-1">Present days</p>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/50 border-b">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Teacher</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {isLoadingAttendance ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Loading records...</p>
                          </td>
                        </tr>
                      ) : attendanceRecords.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground italic">
                            No attendance records found for your account.
                          </td>
                        </tr>
                      ) : (
                        attendanceRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium">{record.date}</td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">{record.teacherName}</td>
                            <td className="px-6 py-4 text-right">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${record.present ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {record.present ? "Present" : "Absent"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : selectedCategory === "quizzes" ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quizzes.length === 0 && completedQuizzes.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-muted-foreground bg-white rounded-3xl border border-dashed">
                    <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No quizzes available for your class yet.</p>
                  </div>
                ) : (
                  <>
                    {quizzes.map((quiz) => (
                      <Card key={quiz.id} className="hover:shadow-md transition-all border-none shadow-sm bg-white">
                        <CardHeader>
                          <CardTitle className="text-lg">{quiz.title}</CardTitle>
                          <CardDescription>{quiz.subject}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{quiz.questions.length} Questions</p>
                        </CardContent>
                        <CardFooter>
                          <Button className="w-full" onClick={() => setActiveQuiz(quiz)}>Start Quiz</Button>
                        </CardFooter>
                      </Card>
                    ))}

                    {completedQuizzes.map((quiz) => (
                      <Card key={quiz.id} className="border-none shadow-sm bg-gray-50/50 opacity-80">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{quiz.title}</CardTitle>
                              <CardDescription>{quiz.subject}</CardDescription>
                            </div>
                            <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                              Completed
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">{quiz.questions.length} Questions</p>
                            <div className="text-right">
                              <p className="text-xl font-black text-primary">{quiz.result.score} / {quiz.result.total}</p>
                              <p className="text-[8px] font-bold uppercase text-muted-foreground">Your Score</p>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button variant="outline" className="w-full" disabled>Quiz Attempted</Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {getSubjects().map((subject) => (
                  <Button
                    key={subject}
                    variant={selectedSubject === subject ? "default" : "outline"}
                    className={`h-24 flex flex-col gap-2 transition-all ${selectedSubject === subject ? "scale-105 shadow-lg" : "hover:bg-primary/5"}`}
                    onClick={() => setSelectedSubject(subject)}
                  >
                    <BookOpen className="w-5 h-5 opacity-70" />
                    <span className="font-semibold uppercase tracking-wider text-xs">{subject}</span>
                  </Button>
                ))}
              </div>

              {selectedSubject && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{selectedSubject}</h3>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          {selectedCategory === "qb" ? "Question Bank" : selectedCategory === "pyq" ? "Previous Year Papers" : "Digital Library"}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedSubject(null)}>
                      Change Subject
                    </Button>
                  </div>

                  {isLoadingFiles ? (
                    <div className="py-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">Fetching documents...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(() => {
                        const files = selectedCategory === "qb" ? qbFiles : 
                                      selectedCategory === "pyq" ? pyqFiles : 
                                      selectedCategory === "textbooks" ? libraryFiles : resourceFiles;
                        
                        if (files.length === 0) {
                          return (
                            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                              <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                              <p className="text-muted-foreground">No documents uploaded for this subject yet.</p>
                            </div>
                          );
                        }

                        return files.map((file) => (
                          <Card key={file.id} className="hover:shadow-md transition-all border-none shadow-sm bg-white group">
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between">
                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-2 py-0.5 rounded uppercase">
                                  {file.fileType?.split('/')[1] || 'PDF'}
                                </div>
                              </div>
                              <CardTitle className="text-base mt-4 line-clamp-2">{file.title}</CardTitle>
                              <CardDescription className="text-[10px] uppercase tracking-wider">
                                Uploaded by {file.teacherName}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pb-4">
                              <p className="text-[10px] text-muted-foreground">
                                {file.createdAt?.toDate() ? new Date(file.createdAt.toDate()).toLocaleDateString() : "Recently"}
                              </p>
                            </CardContent>
                            <CardFooter>
                              <Button className="w-full gap-2" asChild>
                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4" /> Open Document
                                </a>
                              </Button>
                            </CardFooter>
                          </Card>
                        ));
                      })()}
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )}
        </motion.section>
      )}

      {!selectedCategory && (
        <section className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold">Select a category above</h3>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Choose a repository to start browsing questions for your current semester.
          </p>
        </section>
      )}
      {/* Approval Notification Modal */}
      {approvalResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6"
          >
            <div className="text-center space-y-2">
              <div className={`w-12 h-12 ${approvalResult.status === "approved" ? "bg-emerald-50" : "bg-red-50"} rounded-full flex items-center justify-center mx-auto mb-2`}>
                {approvalResult.status === "approved" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              <h3 className="text-xl font-bold">
                Profile Change {approvalResult.status === "approved" ? "Approved" : "Denied"}
              </h3>
              <p className="text-muted-foreground">
                {approvalResult.status === "approved" 
                  ? "Your request to update academic details has been approved. Your profile has been updated."
                  : "Your request to update academic details has been denied by the teacher."}
              </p>
            </div>
            <Button 
              className="w-full" 
              onClick={handleAcknowledgeApproval}
            >
              Got it
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
