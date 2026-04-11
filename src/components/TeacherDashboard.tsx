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
import { UserCog, BookOpen, Upload, FileText, Link as LinkIcon, Settings, ChevronLeft, Plus, Trash2, ExternalLink, Users as UsersIcon, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { doc, updateDoc, collection, addDoc, setDoc, serverTimestamp, getDocs, query, where, deleteDoc, orderBy, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, handleFirestoreError, OperationType } from "@/lib/firebase";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface TeacherDashboardProps {
  user: any;
  userProfile: any;
  onProfileUpdate: () => void;
}

type DashboardView = "main" | "upload-qb" | "manage-textbooks" | "manage-pyqs" | "manage-resources" | "attendance" | "create-quiz" | "view-records" | "student-list" | "profile-approvals";

const DEPT_CONFIG: Record<string, { years: string[], divisions: string[] }> = {
  "ES AND H": {
    years: ["1"],
    divisions: ["A", "B", "C", "D", "E", "F", "G"]
  },
  "IOT": {
    years: ["2", "3", "4"],
    divisions: ["A", "B"]
  },
  "COMP": {
    years: ["2", "3", "4"],
    divisions: ["A", "B", "C", "D", "E"]
  },
  "CIVIL": {
    years: ["2", "3", "4"],
    divisions: ["A"]
  },
  "MECH": {
    years: ["2", "3", "4"],
    divisions: ["A"]
  },
  "EXTC": {
    years: ["2", "3", "4"],
    divisions: ["A", "B"]
  },
  "ENTC": {
    years: ["2", "3", "4"],
    divisions: ["A"]
  },
  "ENCS": {
    years: ["2", "3", "4"],
    divisions: ["A"]
  }
};

export default function TeacherDashboard({ user, userProfile, onProfileUpdate }: TeacherDashboardProps) {
  const [activeView, setActiveView] = React.useState<DashboardView>("main");
  const [department, setDepartment] = React.useState(userProfile?.department || "");
  const [teachingYear, setTeachingYear] = React.useState(userProfile?.teachingYear || "");
  const [teachingClass, setTeachingClass] = React.useState(userProfile?.teachingClass || "");
  const [semester, setSemester] = React.useState(userProfile?.semester || "");
  const [division, setDivision] = React.useState(userProfile?.division || "");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  // Attendance State
  const [attendanceDate, setAttendanceDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = React.useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = React.useState(false);
  const [latestAttendance, setLatestAttendance] = React.useState<any | null>(null);

  // Student List & Scores State
  const [classQuizzes, setClassQuizzes] = React.useState<any[]>([]);
  const [studentScores, setStudentScores] = React.useState<Record<string, Record<string, any>>>({});
  const [isLoadingClassData, setIsLoadingClassData] = React.useState(false);

  // Approval State
  const [pendingApprovals, setPendingApprovals] = React.useState<any[]>([]);
  const [isHandlingApproval, setIsHandlingApproval] = React.useState(false);

  const isProfileComplete = userProfile?.department && userProfile?.teachingYear && userProfile?.division && userProfile?.semester;

  const getAvailableDivisions = (dept: string) => {
    return DEPT_CONFIG[dept]?.divisions || ["A", "B", "C", "D", "E", "F", "G", "NONE"];
  };

  const getAvailableYears = (dept: string) => {
    return DEPT_CONFIG[dept]?.years || ["1", "2", "3", "4"];
  };

  const fetchStudents = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    setIsLoadingStudents(true);
    try {
      // For ES AND H, we look for 1st year students in the specific teachingClass
      // For others, we look for students in that department and year
      let q;
      if (userProfile.department === "ES AND H") {
        q = query(
          collection(db, "users"),
          where("role", "==", "student"),
          where("department", "==", userProfile.teachingClass || ""),
          where("academicYear", "==", "FIRST YEAR"),
          where("semester", "==", userProfile.semester || ""),
          where("division", "==", userProfile.division)
        );
      } else {
        const yearMap: Record<string, string> = {
          "2": "SECOND YEAR",
          "3": "THIRD YEAR",
          "4": "FOURTH YEAR"
        };
        q = query(
          collection(db, "users"),
          where("role", "==", "student"),
          where("department", "==", userProfile.department),
          where("academicYear", "==", yearMap[userProfile.teachingYear] || ""),
          where("semester", "==", userProfile.semester || ""),
          where("division", "==", userProfile.division)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const studentList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as object),
        present: true // Default to present
      }));
      setStudents(studentList);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast.error("Failed to load student list");
    } finally {
      setIsLoadingStudents(false);
    }
  };

  React.useEffect(() => {
    if (activeView === "attendance" || activeView === "student-list") {
      fetchStudents();
    }
    if (activeView === "student-list") {
      fetchClassPerformance();
    }
  }, [activeView]);

  const fetchClassPerformance = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    setIsLoadingClassData(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      
      // 1. Fetch all quizzes for this class
      const quizzesRef = collection(db, "departments", deptId, "classes", classId, "quizzes");
      const quizSnapshot = await getDocs(quizzesRef);
      const quizzes = quizSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClassQuizzes(quizzes);

      // 2. Fetch all scores for each quiz
      const scoresMap: Record<string, Record<string, any>> = {};
      for (const quiz of quizzes) {
        const scoresRef = collection(db, "departments", deptId, "classes", classId, "quizzes", quiz.id, "scores");
        const scoresSnapshot = await getDocs(scoresRef);
        scoresSnapshot.docs.forEach(doc => {
          const scoreData = doc.data();
          const studentId = scoreData.studentId;
          if (!scoresMap[studentId]) scoresMap[studentId] = {};
          scoresMap[studentId][quiz.id] = scoreData;
        });
      }
      setStudentScores(scoresMap);
    } catch (error) {
      console.error("Error fetching class performance:", error);
      toast.error("Failed to load class performance data");
    } finally {
      setIsLoadingClassData(false);
    }
  };

  const toggleAttendance = (studentId: string) => {
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, present: !s.present } : s
    ));
  };

  const handleSaveAttendance = async () => {
    setIsUpdating(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      const attendanceDocRef = doc(db, "departments", deptId, "classes", classId, "attendance", attendanceDate);
      
      await setDoc(attendanceDocRef, {
        date: attendanceDate,
        teacherId: user.uid,
        teacherName: userProfile.name,
        records: students.map(s => ({
          studentId: s.id,
          studentName: s.name,
          erpId: s.erpId,
          present: s.present
        })),
        createdAt: serverTimestamp()
      });
      toast.success("Attendance recorded successfully!");
      setActiveView("main");
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error("Failed to save attendance");
    } finally {
      setIsUpdating(false);
    }
  };

  // Question Bank Form State
  const [qbSubject, setQbSubject] = React.useState("");
  const [qbTopic, setQbTopic] = React.useState("");
  const [qbDifficulty, setQbDifficulty] = React.useState("Medium");
  const [qbQuestion, setQbQuestion] = React.useState("");
  const [qbAnswer, setQbAnswer] = React.useState("");

  // Digital Library State
  const [librarySubject, setLibrarySubject] = React.useState("");
  const [libraryTitle, setLibraryTitle] = React.useState("");
  const [libraryUrl, setLibraryUrl] = React.useState("");
  const [libraryItems, setLibraryItems] = React.useState<any[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = React.useState(false);

  // Records View State
  const [viewMode, setViewMode] = React.useState<"attendance" | "quizzes" | "student-attendance">("attendance");
  const [attendanceHistory, setAttendanceHistory] = React.useState<any[]>([]);
  const [quizHistory, setQuizHistory] = React.useState<any[]>([]);
  const [selectedQuizScores, setSelectedQuizScores] = React.useState<any[]>([]);
  const [activeQuizId, setActiveQuizId] = React.useState<string | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = React.useState(false);
  const [selectedAttendanceRecord, setSelectedAttendanceRecord] = React.useState<any | null>(null);
  const [selectedStudentAttendance, setSelectedStudentAttendance] = React.useState<any | null>(null);

  const fetchRecords = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    setIsLoadingRecords(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      
      if (viewMode === "attendance") {
        const attendanceRef = collection(db, "departments", deptId, "classes", classId, "attendance");
        const q = query(attendanceRef, orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        setAttendanceHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } else {
        const quizzesRef = collection(db, "departments", deptId, "classes", classId, "quizzes");
        const snapshot = await getDocs(quizzesRef);
        setQuizHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (error) {
      console.error("Error fetching records:", error);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const fetchQuizScores = async (quizId: string) => {
    const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
    const classId = `${userProfile.teachingYear}_${userProfile.division}`;
    const scoresRef = collection(db, "departments", deptId, "classes", classId, "quizzes", quizId, "scores");
    try {
      const snapshot = await getDocs(scoresRef);
      setSelectedQuizScores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setActiveQuizId(quizId);
    } catch (error) {
      console.error("Error fetching scores:", error);
    }
  };

  React.useEffect(() => {
    if (activeView === "view-records") {
      fetchRecords();
    } else if (activeView === "profile-approvals") {
      fetchApprovals();
    }
  }, [activeView, viewMode]);

  // Quiz State
  const [quizTitle, setQuizTitle] = React.useState("");
  const [quizSubject, setQuizSubject] = React.useState("");
  
  // File Upload State
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [fileCategory, setFileCategory] = React.useState<"qb" | "pyq" | "library">("qb");
  const [fileSubject, setFileSubject] = React.useState("");
  const [fileTitle, setFileTitle] = React.useState("");

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !fileSubject || !fileTitle) {
      toast.error("Please fill all fields and select a file");
      return;
    }

    setUploadingFile(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      const timestamp = Date.now();
      const fileName = `${timestamp}_${selectedFile.name}`;
      const storagePath = `uploads/${deptId}/${classId}/${fileCategory}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload file
      const snapshot = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // Save metadata to Firestore
      await addDoc(collection(db, "academic_resources"), {
        title: fileTitle,
        subject: fileSubject,
        url: downloadUrl,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        uploadedBy: user.uid,
        teacherName: userProfile.name,
        createdAt: serverTimestamp(),
        department: deptId,
        classId: classId,
        category: fileCategory,
        year: userProfile.teachingYear,
        semester: userProfile.semester,
        division: userProfile.division,
        status: "pending"
      });

      toast.success("File uploaded and sent for HOD approval!");
      setSelectedFile(null);
      setFileTitle("");
      setFileSubject("");
      
      // Refresh the list if needed
      if (fileCategory === "library") {
        fetchLibraryItems();
      } else if (fileCategory === "pyq") {
        fetchPYQs();
      } else if (fileCategory === "qb") {
        fetchQBFiles();
      } else if (fileCategory === "resources") {
        fetchResources();
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file. Please check your permissions.");
    } finally {
      setUploadingFile(false);
    }
  };

  const [qbFiles, setQbFiles] = React.useState<any[]>([]);
  const [pyqFiles, setPyqFiles] = React.useState<any[]>([]);
  const [resourceFiles, setResourceFiles] = React.useState<any[]>([]);

  const fetchQBFiles = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
    const classId = `${userProfile.teachingYear}_${userProfile.division}`;
    try {
      const q = query(
        collection(db, "academic_resources"), 
        where("classId", "==", classId),
        where("category", "==", "qb"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      setQbFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching QB files:", error);
    }
  };

  const fetchPYQs = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
    const classId = `${userProfile.teachingYear}_${userProfile.division}`;
    try {
      const q = query(
        collection(db, "academic_resources"), 
        where("classId", "==", classId),
        where("category", "==", "pyq"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      setPyqFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching PYQs:", error);
    }
  };

  const fetchResources = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
    const classId = `${userProfile.teachingYear}_${userProfile.division}`;
    try {
      const q = query(
        collection(db, "academic_resources"), 
        where("classId", "==", classId),
        where("category", "==", "resources"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      setResourceFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching resources:", error);
    }
  };

  const handleDeleteFile = async (id: string, category: "qb" | "pyq" | "library" | "resources") => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      await deleteDoc(doc(db, "academic_resources", id));
      toast.success("File deleted successfully");
      if (category === "qb") fetchQBFiles();
      if (category === "pyq") fetchPYQs();
      if (category === "library") fetchLibraryItems();
      if (category === "resources") fetchResources();
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    }
  };

  React.useEffect(() => {
    fetchQBFiles();
    fetchPYQs();
    fetchLibraryItems();
    fetchResources();
  }, []);

  React.useEffect(() => {
    if (activeView === "upload-qb") fetchQBFiles();
    if (activeView === "manage-pyqs") fetchPYQs();
    if (activeView === "manage-textbooks") fetchLibraryItems();
    if (activeView === "manage-resources") fetchResources();
  }, [activeView]);
  const [quizQuestions, setQuizQuestions] = React.useState<any[]>([
    { question: "", options: ["", "", "", ""], correctAnswer: 0 }
  ]);

  const addQuizQuestion = () => {
    setQuizQuestions([...quizQuestions, { question: "", options: ["", "", "", ""], correctAnswer: 0 }]);
  };

  const updateQuizQuestion = (index: number, field: string, value: any) => {
    const updated = [...quizQuestions];
    if (field === "question") updated[index].question = value;
    if (field === "correctAnswer") updated[index].correctAnswer = value;
    setQuizQuestions(updated);
  };

  const updateQuizOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...quizQuestions];
    updated[qIndex].options[oIndex] = value;
    setQuizQuestions(updated);
  };

  const handleCreateQuiz = async () => {
    if (!quizTitle || !quizSubject || quizQuestions.some(q => !q.question)) {
      toast.error("Please fill all quiz details");
      return;
    }
    setIsUpdating(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      const quizCollectionRef = collection(db, "departments", deptId, "classes", classId, "quizzes");
      
      await addDoc(quizCollectionRef, {
        title: quizTitle,
        subject: quizSubject,
        questions: quizQuestions,
        teacherId: user.uid,
        semester: userProfile.semester,
        createdAt: serverTimestamp()
      });
      toast.success("Quiz created successfully!");
      setActiveView("main");
      setQuizTitle("");
      setQuizSubject("");
      setQuizQuestions([{ question: "", options: ["", "", "", ""], correctAnswer: 0 }]);
    } catch (error) {
      console.error("Error creating quiz:", error);
      toast.error("Failed to create quiz");
    } finally {
      setIsUpdating(false);
    }
  };

  const fetchLibraryItems = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    setIsLoadingLibrary(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      const q = query(
        collection(db, "academic_resources"), 
        where("classId", "==", classId),
        where("category", "==", "library"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLibraryItems(items);
    } catch (error) {
      console.error("Error fetching library:", error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const fetchApprovals = async () => {
    if (!userProfile?.department) return;
    setIsLoadingClassData(true);
    try {
      // Teachers see all pending requests for their department
      const q = query(
        collection(db, "profile_requests"),
        where("status", "==", "pending"),
        where("requestedDetails.department", "==", userProfile.department)
      );
      const snapshot = await getDocs(q);
      setPendingApprovals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setIsLoadingClassData(false);
    }
  };

  const handleApproval = async (request: any, approved: boolean) => {
    const toastId = toast.loading(`${approved ? "Approving" : "Denying"} request...`);
    setIsHandlingApproval(true);
    try {
      const requestRef = doc(db, "profile_requests", request.id);
      
      if (approved) {
        // Update student profile
        const studentRef = doc(db, "users", request.erpId);
        try {
          await updateDoc(studentRef, {
            ...request.requestedDetails,
            profileComplete: true
          });
        } catch (error) {
          toast.dismiss(toastId);
          handleFirestoreError(error, OperationType.UPDATE, `users/${request.erpId}`);
        }
        
        try {
          await updateDoc(requestRef, { status: "approved" });
        } catch (error) {
          toast.dismiss(toastId);
          handleFirestoreError(error, OperationType.UPDATE, `profile_requests/${request.id}`);
        }
        
        toast.success(`Approved change for ${request.studentName}`, { id: toastId });
      } else {
        try {
          await updateDoc(requestRef, { status: "denied" });
        } catch (error) {
          toast.dismiss(toastId);
          handleFirestoreError(error, OperationType.UPDATE, `profile_requests/${request.id}`);
        }
        toast.error(`Denied change for ${request.studentName}`, { id: toastId });
      }
      
      fetchApprovals();
    } catch (error) {
      console.error("Error handling approval:", error);
      toast.error("Failed to process approval. Please check permissions.", { id: toastId });
    } finally {
      setIsHandlingApproval(false);
    }
  };

  const fetchLatestAttendance = async () => {
    if (!userProfile?.department || !userProfile?.teachingYear || !userProfile?.division) return;
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      const attendanceRef = collection(db, "departments", deptId, "classes", classId, "attendance");
      const q = query(attendanceRef, orderBy("date", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setLatestAttendance({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      }
    } catch (error) {
      console.error("Error fetching latest attendance:", error);
    }
  };

  React.useEffect(() => {
    if (activeView === "main" && isProfileComplete) {
      fetchLatestAttendance();
    }
  }, [activeView, isProfileComplete]);

  React.useEffect(() => {
    if (userProfile?.department) {
      fetchLibraryItems();
      fetchApprovals();
    }
  }, [userProfile?.department]);

  const handleUploadQB = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qbSubject || !qbTopic || !qbQuestion) {
      toast.error("Please fill required fields");
      return;
    }

    setIsUpdating(true);
    try {
      await addDoc(collection(db, "question_banks"), {
        subject: qbSubject,
        topic: qbTopic,
        difficulty: qbDifficulty,
        question: qbQuestion,
        answer: qbAnswer,
        department: userProfile.department,
        year: userProfile.teachingYear,
        uploadedBy: user.uid,
        teacherName: userProfile.name,
        createdAt: serverTimestamp()
      });
      toast.success("Question added successfully!");
      setQbQuestion("");
      setQbAnswer("");
    } catch (error) {
      console.error("Error uploading QB:", error);
      toast.error("Failed to upload question");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddTextbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!librarySubject || !libraryTitle || !libraryUrl) {
      toast.error("Please fill all fields");
      return;
    }

    setIsUpdating(true);
    try {
      const deptId = userProfile.department === "ES AND H" ? userProfile.teachingClass : userProfile.department;
      const classId = `${userProfile.teachingYear}_${userProfile.division}`;
      await addDoc(collection(db, "academic_resources"), {
        subject: librarySubject,
        title: libraryTitle,
        url: libraryUrl,
        department: deptId,
        classId: classId,
        category: "library",
        year: userProfile.teachingYear,
        division: userProfile.division,
        semester: userProfile.semester,
        uploadedBy: user.uid,
        teacherName: userProfile.name,
        status: "pending",
        createdAt: serverTimestamp()
      });
      toast.success("Link added and sent for HOD approval!");
      setLibrarySubject("");
      setLibraryTitle("");
      setLibraryUrl("");
      fetchLibraryItems();
    } catch (error) {
      toast.error("Failed to add link");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTextbook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteDoc(doc(db, "academic_resources", id));
      toast.success("Item deleted");
      fetchLibraryItems();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const handleSaveProfile = async () => {
    if (!department || !teachingYear || !division || !semester || (department === "ES AND H" && !teachingClass)) {
      toast.error("Please fill all fields");
      return;
    }

    setIsUpdating(true);
    try {
      const erpId = userProfile.erpId;
      const userDocRef = doc(db, "users", erpId);
      
      await updateDoc(userDocRef, {
        department,
        teachingYear,
        teachingClass: department === "ES AND H" ? teachingClass : "",
        semester,
        division,
        profileComplete: true
      });

      toast.success("Profile updated successfully!");
      setIsEditing(false);
      onProfileUpdate();
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
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
                <UserCog className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">{isEditing ? "Update Profile" : "Teacher Onboarding"}</CardTitle>
              <CardDescription>
                {isEditing ? "Modify your teaching assignment below." : "Set up your teaching profile to manage question banks and resources."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ... (keep existing form fields) */}
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={(val) => {
                  setDepartment(val);
                  setTeachingYear("");
                  setDivision("");
                }}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(DEPT_CONFIG).map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Year You Teach</Label>
                <Select value={teachingYear} onValueChange={setTeachingYear} disabled={!department}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableYears(department).map((year) => (
                      <SelectItem key={year} value={year}>Year {year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {department === "ES AND H" && (
                <div className="space-y-2">
                  <Label>Class (Department)</Label>
                  <Select value={teachingClass} onValueChange={setTeachingClass}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IOT">IOT</SelectItem>
                      <SelectItem value="COMP">COMP</SelectItem>
                      <SelectItem value="ENCS">ENPCSP</SelectItem>
                      <SelectItem value="EXTC">EXTC</SelectItem>
                      <SelectItem value="ENTC">ENTC</SelectItem>
                      <SelectItem value="MECH">MECH</SelectItem>
                      <SelectItem value="CIVIL">CIVIL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Semester 1</SelectItem>
                    <SelectItem value="2">Semester 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={division} onValueChange={setDivision} disabled={!teachingYear || (department === "ES AND H" && !teachingClass)}>
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
                {isUpdating ? "Saving..." : isEditing ? "Update" : "Enter Dashboard"}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (activeView === "student-list") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
          <div className="bg-white px-4 py-2 rounded-xl shadow-sm border text-sm font-medium">
            Total Registered: <span className="text-primary font-bold">{students.length}</span>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10">
            <CardTitle>Registered Students & Performance</CardTitle>
            <CardDescription>
              {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department} • Year {userProfile.teachingYear} • Semester {userProfile.semester} • Division {userProfile.division}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingStudents || isLoadingClassData ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading student data...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <UsersIcon className="w-12 h-12 mx-auto mb-4 text-gray-200" />
                <p>No students registered for this class yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-b">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Student Details</th>
                      {classQuizzes.map(quiz => (
                        <th key={quiz.id} className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center min-w-[120px]">
                          {quiz.title}
                          <span className="block text-[8px] font-normal normal-case opacity-60">{quiz.subject}</span>
                        </th>
                      ))}
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((student) => {
                      const scores = studentScores[student.uid] || {};
                      let totalScore = 0;
                      let totalPossible = 0;
                      let quizCount = 0;

                      return (
                        <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center font-bold text-xs text-primary">
                                {student.name.charAt(0)}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{student.name}</p>
                                <p className="text-[10px] text-muted-foreground">ERP: {student.erpId}</p>
                              </div>
                            </div>
                          </td>
                          {classQuizzes.map(quiz => {
                            const score = scores[quiz.id];
                            if (score) {
                              totalScore += score.score;
                              totalPossible += score.total;
                              quizCount++;
                            }
                            return (
                              <td key={quiz.id} className="px-6 py-4 text-center">
                                {score ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="text-sm font-bold text-primary">{score.score}/{score.total}</span>
                                    <span className="text-[8px] text-muted-foreground">
                                      {Math.round((score.score / score.total) * 100)}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300 italic">Not Attempted</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 text-right">
                            {quizCount > 0 ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="text-sm font-black text-emerald-600">
                                  {Math.round((totalScore / totalPossible) * 100)}%
                                </span>
                                <span className="text-[8px] text-muted-foreground">{quizCount} Quizzes</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeView === "profile-approvals") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
          <div className="text-right">
            <h2 className="text-xl font-bold">Profile Change Approvals</h2>
            <p className="text-xs text-muted-foreground">
              Review and approve student academic detail changes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {isLoadingClassData ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading requests...</p>
            </div>
          ) : pendingApprovals.length === 0 ? (
            <Card className="border-dashed border-2 bg-gray-50/50 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-bold text-gray-400">All caught up!</h3>
              <p className="text-sm text-muted-foreground">No pending profile change requests.</p>
            </Card>
          ) : (
            pendingApprovals.map((request) => (
              <Card key={request.id} className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                        {request.studentName.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-base">{request.studentName}</CardTitle>
                        <CardDescription className="text-xs font-mono">ERP: {request.erpId}</CardDescription>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground">
                      Requested {request.createdAt?.toDate() ? new Date(request.createdAt.toDate()).toLocaleDateString() : "Just now"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Current Details</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-mono">{request.currentDetails.department}</span>
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-mono">Year {request.currentDetails.academicYear}</span>
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-mono">Sem {request.currentDetails.semester}</span>
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-mono">Div {request.currentDetails.division}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-primary tracking-widest">Requested Details</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-[10px] font-mono font-bold">{request.requestedDetails.department}</span>
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-[10px] font-mono font-bold">Year {request.requestedDetails.academicYear}</span>
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-[10px] font-mono font-bold">Sem {request.requestedDetails.semester}</span>
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-[10px] font-mono font-bold">Div {request.requestedDetails.division}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50/50 flex justify-end gap-3 py-3">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleApproval(request, false)}
                    disabled={isHandlingApproval}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Deny
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleApproval(request, true)}
                    disabled={isHandlingApproval}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Change
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  if (activeView === "attendance") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
          <div className="flex items-center gap-4 bg-white p-2 px-4 rounded-xl shadow-sm">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Date</Label>
            <Input 
              type="date" 
              className="border-none shadow-none h-8 w-40" 
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
          </div>
        </div>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Mark Attendance</CardTitle>
                <CardDescription>
                  {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department} • Year {userProfile.teachingYear} • Division {userProfile.division}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{students.filter(s => s.present).length} / {students.length}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase">Present Students</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingStudents ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading student list...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <UsersIcon className="w-12 h-12 mx-auto mb-4 text-gray-200" />
                <p>No students found for this class.</p>
                <p className="text-sm">Students must register and complete their profile first.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {students.map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{student.name}</p>
                        <p className="text-xs text-muted-foreground">ERP: {student.erpId}</p>
                      </div>
                    </div>
                    <Button
                      variant={student.present ? "default" : "outline"}
                      className={`w-32 gap-2 ${student.present ? "bg-emerald-500 hover:bg-emerald-600" : "text-destructive hover:bg-destructive/5"}`}
                      onClick={() => toggleAttendance(student.id)}
                    >
                      {student.present ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Present
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" /> Absent
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="p-6 bg-gray-50 border-t border-gray-100">
            <Button 
              className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20" 
              onClick={handleSaveAttendance}
              disabled={isUpdating || students.length === 0}
            >
              {isUpdating ? "Saving Attendance..." : "Submit Attendance"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (activeView === "view-records") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => {
            setActiveView("main");
            setActiveQuizId(null);
          }} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <Button 
              variant={viewMode === "attendance" ? "default" : "ghost"} 
              size="sm"
              onClick={() => {
                setViewMode("attendance");
                setActiveQuizId(null);
                setSelectedStudentAttendance(null);
              }}
            >
              By Date
            </Button>
            <Button 
              variant={viewMode === "student-attendance" ? "default" : "ghost"} 
              size="sm"
              onClick={() => {
                setViewMode("student-attendance");
                setActiveQuizId(null);
                setSelectedAttendanceRecord(null);
                fetchStudents();
              }}
            >
              By Student
            </Button>
            <Button 
              variant={viewMode === "quizzes" ? "default" : "ghost"} 
              size="sm"
              onClick={() => {
                setViewMode("quizzes");
                setSelectedStudentAttendance(null);
                setSelectedAttendanceRecord(null);
              }}
            >
              Quiz Scores
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>
              {viewMode === "attendance" && "Attendance History (By Date)"}
              {viewMode === "student-attendance" && "Student Attendance Records"}
              {viewMode === "quizzes" && "Quiz Performance"}
            </CardTitle>
            <CardDescription>
              Viewing records for {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department} • Year {userProfile.teachingYear} • Semester {userProfile.semester} • Division {userProfile.division}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRecords ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading records...</p>
              </div>
            ) : viewMode === "attendance" ? (
              selectedAttendanceRecord ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedAttendanceRecord(null)}>
                      <ChevronLeft className="w-4 h-4 mr-1" /> Back to History
                    </Button>
                    <div className="text-right">
                      <p className="font-bold">{selectedAttendanceRecord.date}</p>
                      <p className="text-xs text-muted-foreground">Marked by {selectedAttendanceRecord.teacherName}</p>
                    </div>
                  </div>
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {selectedAttendanceRecord.records.map((record: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${record.present ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {record.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-base">{record.studentName}</p>
                            <p className="text-xs text-muted-foreground font-mono">ERP: {record.erpId}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${record.present ? "bg-emerald-500" : "bg-red-500"} animate-pulse`} />
                          <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${record.present ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                            {record.present ? "Present" : "Absent"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {attendanceHistory.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No attendance records found.</p>
                  ) : (
                    attendanceHistory.map((record) => (
                      <div 
                        key={record.id} 
                        className="p-4 border rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer group"
                        onClick={() => setSelectedAttendanceRecord(record)}
                      >
                        <div>
                          <p className="font-bold text-lg group-hover:text-primary transition-colors">{record.date}</p>
                          <p className="text-sm text-muted-foreground">Marked by {record.teacherName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-primary">
                            {record.records.filter((r: any) => r.present).length} / {record.records.length}
                          </p>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Present</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )
            ) : viewMode === "student-attendance" ? (
              selectedStudentAttendance ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedStudentAttendance(null)}>
                      <ChevronLeft className="w-4 h-4 mr-1" /> Back to Students
                    </Button>
                    <div className="text-right">
                      <p className="font-bold">{selectedStudentAttendance.name}</p>
                      <p className="text-xs text-muted-foreground">ERP: {selectedStudentAttendance.erpId}</p>
                    </div>
                  </div>
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {attendanceHistory.map((session) => {
                      const record = session.records.find((r: any) => r.erpId === selectedStudentAttendance.erpId);
                      if (!record) return null;
                      return (
                        <div key={session.id} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors">
                          <div>
                            <p className="font-bold">{session.date}</p>
                            <p className="text-xs text-muted-foreground">Marked by {session.teacherName}</p>
                          </div>
                          <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${record.present ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                            {record.present ? "Present" : "Absent"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {students.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No students registered.</p>
                  ) : (
                    students.map((student) => {
                      const totalLectures = attendanceHistory.length;
                      const attendedLectures = attendanceHistory.filter(session => 
                        session.records.find((r: any) => r.erpId === student.erpId)?.present
                      ).length;
                      const percentage = totalLectures > 0 ? Math.round((attendedLectures / totalLectures) * 100) : 0;

                      return (
                        <div 
                          key={student.id} 
                          className="p-4 border rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer group"
                          onClick={() => setSelectedStudentAttendance(student)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary">
                              {student.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-lg group-hover:text-primary transition-colors">{student.name}</p>
                              <p className="text-sm text-muted-foreground">ERP: {student.erpId}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-black ${percentage >= 75 ? "text-emerald-600" : "text-orange-600"}`}>
                              {percentage}%
                            </p>
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">{attendedLectures} / {totalLectures} Lectures</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )
            ) : (
              <div className="space-y-6">
                {!activeQuizId ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quizHistory.length === 0 ? (
                      <p className="col-span-full text-center py-10 text-muted-foreground">No quizzes created yet.</p>
                    ) : (
                      quizHistory.map((quiz) => (
                        <Card key={quiz.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => fetchQuizScores(quiz.id)}>
                          <CardHeader className="p-4">
                            <CardTitle className="text-base">{quiz.title}</CardTitle>
                            <CardDescription>{quiz.subject}</CardDescription>
                          </CardHeader>
                          <CardFooter className="p-4 pt-0">
                            <Button variant="outline" size="sm" className="w-full">View Scores</Button>
                          </CardFooter>
                        </Card>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Button variant="ghost" size="sm" onClick={() => setActiveQuizId(null)} className="mb-2">
                      <ChevronLeft className="w-4 h-4 mr-1" /> Back to Quizzes
                    </Button>
                    <div className="divide-y border rounded-xl overflow-hidden">
                      {selectedQuizScores.length === 0 ? (
                        <p className="p-8 text-center text-muted-foreground">No students have taken this quiz yet.</p>
                      ) : (
                        selectedQuizScores.map((score) => (
                          <div key={score.id} className="p-4 flex justify-between items-center bg-white">
                            <div>
                              <p className="font-bold">{score.studentName}</p>
                              <p className="text-xs text-muted-foreground">ERP: {score.erpId}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-black text-primary">{score.score} / {score.total}</p>
                              <p className="text-[10px] font-bold uppercase text-muted-foreground">Score</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeView === "create-quiz") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        <Card className="border-none shadow-sm bg-white max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Create New Quiz</CardTitle>
            <CardDescription>Design a quiz for your class. Scores will be saved per student.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quiz Title</Label>
                <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="e.g. Unit 1 Class Test" />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={quizSubject} onChange={(e) => setQuizSubject(e.target.value)} placeholder="e.g. Operating Systems" />
              </div>
            </div>

            <div className="space-y-8">
              {quizQuestions.map((q, qIndex) => (
                <div key={qIndex} className="p-4 border rounded-xl space-y-4 bg-gray-50/50">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-primary">Question {qIndex + 1}</h4>
                    {quizQuestions.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setQuizQuestions(quizQuestions.filter((_, i) => i !== qIndex))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Question Text</Label>
                    <Textarea 
                      value={q.question} 
                      onChange={(e) => updateQuizQuestion(qIndex, "question", e.target.value)}
                      placeholder="Enter the question..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {q.options.map((opt: string, oIndex: number) => (
                      <div key={oIndex} className="space-y-1">
                        <Label className="text-xs">Option {oIndex + 1}</Label>
                        <div className="flex gap-2 items-center">
                          <Input 
                            value={opt} 
                            onChange={(e) => updateQuizOption(qIndex, oIndex, e.target.value)}
                            placeholder={`Option ${oIndex + 1}`}
                          />
                          <input 
                            type="radio" 
                            name={`correct-${qIndex}`} 
                            checked={q.correctAnswer === oIndex}
                            onChange={() => updateQuizQuestion(qIndex, "correctAnswer", oIndex)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full border-dashed" onClick={addQuizQuestion}>
              <Plus className="w-4 h-4 mr-2" /> Add Another Question
            </Button>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleCreateQuiz} disabled={isUpdating}>
              {isUpdating ? "Creating Quiz..." : "Create Quiz"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (activeView === "upload-qb") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Upload Question Bank PDF</CardTitle>
              <CardDescription>Upload complete question bank documents for students.</CardDescription>
            </CardHeader>
            <form onSubmit={(e) => { setFileCategory("qb"); handleFileUpload(e); }}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input 
                    placeholder="e.g. Operating Systems" 
                    value={fileCategory === "qb" ? fileSubject : ""} 
                    onChange={(e) => { setFileCategory("qb"); setFileSubject(e.target.value); }} 
                    required={fileCategory === "qb"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Title</Label>
                  <Input 
                    placeholder="e.g. OS Question Bank 2026" 
                    value={fileCategory === "qb" ? fileTitle : ""} 
                    onChange={(e) => { setFileCategory("qb"); setFileTitle(e.target.value); }} 
                    required={fileCategory === "qb"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select PDF/File</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => { setFileCategory("qb"); setSelectedFile(e.target.files?.[0] || null); }}
                      required={fileCategory === "qb"}
                    />
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {fileCategory === "qb" && selectedFile ? selectedFile.name : "Click to browse or drag and drop"}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={uploadingFile && fileCategory === "qb"}>
                  {uploadingFile && fileCategory === "qb" ? "Uploading..." : "Upload QB File"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Add Single Question</CardTitle>
              <CardDescription>Add a question to the subject repository manually.</CardDescription>
            </CardHeader>
            <form onSubmit={handleUploadQB}>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input 
                      placeholder="e.g. Operating Systems" 
                      value={qbSubject} 
                      onChange={(e) => setQbSubject(e.target.value)} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Topic/Module</Label>
                    <Input 
                      placeholder="e.g. Process Scheduling" 
                      value={qbTopic} 
                      onChange={(e) => setQbTopic(e.target.value)} 
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty Level</Label>
                  <Select value={qbDifficulty} onValueChange={setQbDifficulty}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Question Text</Label>
                  <Textarea 
                    placeholder="Enter the question here..." 
                    className="min-h-[80px]"
                    value={qbQuestion}
                    onChange={(e) => setQbQuestion(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isUpdating}>
                  {isUpdating ? "Saving..." : "Save Question"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Uploaded Question Banks</CardTitle>
            <CardDescription>Manage your uploaded QB documents.</CardDescription>
          </CardHeader>
          <CardContent>
            {qbFiles.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground italic">No QB files uploaded yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {qbFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="max-w-[200px]">
                        <p className="font-semibold text-sm truncate">{file.title}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{file.subject}</p>
                        {file.status === "pending" && (
                          <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded font-bold">PENDING APPROVAL</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={file.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFile(file.id, "qb")}>
                        <Trash2 className="w-4 h-4" />
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

  if (activeView === "manage-textbooks") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <Card className="border-none shadow-sm bg-white h-fit">
              <CardHeader>
                <CardTitle>Upload PDF Book</CardTitle>
                <CardDescription>Upload textbooks or reference materials.</CardDescription>
              </CardHeader>
              <form onSubmit={(e) => { setFileCategory("library"); handleFileUpload(e); }}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input 
                      placeholder="e.g. Data Structures" 
                      value={fileCategory === "library" ? fileSubject : ""} 
                      onChange={(e) => { setFileCategory("library"); setFileSubject(e.target.value); }} 
                      required={fileCategory === "library"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Book Title</Label>
                    <Input 
                      placeholder="e.g. Algorithms by Cormen" 
                      value={fileCategory === "library" ? fileTitle : ""} 
                      onChange={(e) => { setFileCategory("library"); setFileTitle(e.target.value); }} 
                      required={fileCategory === "library"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Select PDF</Label>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={(e) => { setFileCategory("library"); setSelectedFile(e.target.files?.[0] || null); }}
                        required={fileCategory === "library"}
                      />
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {fileCategory === "library" && selectedFile ? selectedFile.name : "Click to browse"}
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={uploadingFile && fileCategory === "library"}>
                    {uploadingFile && fileCategory === "library" ? "Uploading..." : "Upload to Library"}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <Card className="border-none shadow-sm bg-white h-fit">
              <CardHeader>
                <CardTitle>Add Online Link</CardTitle>
                <CardDescription>Share external reference URLs.</CardDescription>
              </CardHeader>
              <form onSubmit={handleAddTextbook}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input 
                      placeholder="e.g. Data Structures" 
                      value={librarySubject} 
                      onChange={(e) => setLibrarySubject(e.target.value)} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input 
                      placeholder="e.g. GeeksforGeeks DS" 
                      value={libraryTitle} 
                      onChange={(e) => setLibraryTitle(e.target.value)} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input 
                      placeholder="https://example.com" 
                      value={libraryUrl} 
                      onChange={(e) => setLibraryUrl(e.target.value)} 
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isUpdating}>
                    <Plus className="w-4 h-4 mr-2" /> Add Link
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          <Card className="lg:col-span-2 border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Digital Library</CardTitle>
              <CardDescription>Manage materials for {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLibrary ? (
                <div className="py-12 text-center">Loading...</div>
              ) : libraryItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground italic">No materials uploaded yet.</div>
              ) : (
                <div className="space-y-3">
                  {libraryItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl group border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          {item.url.includes("firebasestorage") ? <FileText className="w-5 h-5 text-emerald-600" /> : <BookOpen className="w-5 h-5 text-emerald-600" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{item.subject} • {item.url.includes("firebasestorage") ? "PDF" : "Link"}</p>
                          {item.status === "pending" && (
                            <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded font-bold">PENDING APPROVAL</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" asChild>
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteTextbook(item.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (activeView === "manage-resources") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="border-none shadow-sm bg-white h-fit">
            <CardHeader>
              <CardTitle>Upload Resource</CardTitle>
              <CardDescription>Share documentation, notes, or other materials.</CardDescription>
            </CardHeader>
            <form onSubmit={(e) => { setFileCategory("resources"); handleFileUpload(e); }}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input 
                    placeholder="e.g. Computer Networks" 
                    value={fileCategory === "resources" ? fileSubject : ""} 
                    onChange={(e) => { setFileCategory("resources"); setFileSubject(e.target.value); }} 
                    required={fileCategory === "resources"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Resource Title</Label>
                  <Input 
                    placeholder="e.g. Network Layer Notes" 
                    value={fileCategory === "resources" ? fileTitle : ""} 
                    onChange={(e) => { setFileCategory("resources"); setFileTitle(e.target.value); }} 
                    required={fileCategory === "resources"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select File</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => { setFileCategory("resources"); setSelectedFile(e.target.files?.[0] || null); }}
                      required={fileCategory === "resources"}
                    />
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {fileCategory === "resources" && selectedFile ? selectedFile.name : "Click to browse"}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={uploadingFile && fileCategory === "resources"}>
                  {uploadingFile && fileCategory === "resources" ? "Uploading..." : "Upload Resource"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="lg:col-span-2 border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Resource Hub</CardTitle>
              <CardDescription>Manage shared materials for your class.</CardDescription>
            </CardHeader>
            <CardContent>
              {resourceFiles.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground italic">No resources uploaded yet.</div>
              ) : (
                <div className="space-y-3">
                  {resourceFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl group border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <LinkIcon className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{file.title}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{file.subject}</p>
                          {file.status === "pending" && (
                            <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded font-bold">PENDING APPROVAL</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" asChild>
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFile(file.id, "resources")}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (activeView === "manage-pyqs") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setActiveView("main")} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="border-none shadow-sm bg-white h-fit">
            <CardHeader>
              <CardTitle>Upload PYQ Paper</CardTitle>
              <CardDescription>Upload previous year university papers.</CardDescription>
            </CardHeader>
            <form onSubmit={(e) => { setFileCategory("pyq"); handleFileUpload(e); }}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input 
                    placeholder="e.g. Computer Networks" 
                    value={fileCategory === "pyq" ? fileSubject : ""} 
                    onChange={(e) => { setFileCategory("pyq"); setFileSubject(e.target.value); }} 
                    required={fileCategory === "pyq"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Paper Title/Year</Label>
                  <Input 
                    placeholder="e.g. May 2024 University Paper" 
                    value={fileCategory === "pyq" ? fileTitle : ""} 
                    onChange={(e) => { setFileCategory("pyq"); setFileTitle(e.target.value); }} 
                    required={fileCategory === "pyq"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select PDF</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => { setFileCategory("pyq"); setSelectedFile(e.target.files?.[0] || null); }}
                      required={fileCategory === "pyq"}
                    />
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {fileCategory === "pyq" && selectedFile ? selectedFile.name : "Click to browse"}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={uploadingFile && fileCategory === "pyq"}>
                  {uploadingFile && fileCategory === "pyq" ? "Uploading..." : "Upload PYQ"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="lg:col-span-2 border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Previous Year Papers</CardTitle>
              <CardDescription>Manage papers for {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department}</CardDescription>
            </CardHeader>
            <CardContent>
              {pyqFiles.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground italic">No PYQ papers uploaded yet.</div>
              ) : (
                <div className="space-y-3">
                  {pyqFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl group border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{file.title}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{file.subject}</p>
                          {file.status === "pending" && (
                            <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded font-bold">PENDING APPROVAL</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" asChild>
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFile(file.id, "pyq")}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
          <p className="text-muted-foreground">
            {userProfile.department === "ES AND H" ? `${userProfile.department} (${userProfile.teachingClass})` : userProfile.department} • Year {userProfile.teachingYear} • Division {userProfile.division}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Change Academic Details
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("student-list")}
        >
          <CardHeader className="p-6">
            <UsersIcon className="w-8 h-8 mb-3 text-emerald-500 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-lg">Class List</CardTitle>
            <CardDescription>View all registered students and their quiz performance</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white relative overflow-hidden"
          onClick={() => setActiveView("profile-approvals")}
        >
          {pendingApprovals.length > 0 && (
            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl animate-pulse">
              {pendingApprovals.length} PENDING
            </div>
          )}
          <CardHeader className="p-6">
            <UserCog className="w-8 h-8 mb-3 text-orange-500 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-lg">Approvals</CardTitle>
            <CardDescription>Review student profile change requests</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("attendance")}
        >
          <CardHeader className="p-4">
            <UsersIcon className="w-8 h-8 text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Attendance</CardTitle>
            <CardDescription className="text-[10px]">Mark daily attendance</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("view-records")}
        >
          <CardHeader className="p-4">
            <FileText className="w-8 h-8 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">View Records</CardTitle>
            <CardDescription className="text-[10px]">Attendance & Quiz data</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("create-quiz")}
        >
          <CardHeader className="p-4">
            <HelpCircle className="w-8 h-8 text-pink-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Create Quiz</CardTitle>
            <CardDescription className="text-[10px]">Design class quizzes</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("upload-qb")}
        >
          <CardHeader className="p-4">
            <Upload className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Upload QB</CardTitle>
            <CardDescription className="text-[10px]">Add new questions</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("manage-pyqs")}
        >
          <CardHeader className="p-4">
            <FileText className="w-8 h-8 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Manage PYQs</CardTitle>
            <CardDescription className="text-[10px]">Organize papers</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("manage-textbooks")}
        >
          <CardHeader className="p-4">
            <BookOpen className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Digital Library</CardTitle>
            <CardDescription className="text-[10px]">Manage textbooks</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:shadow-md transition-all cursor-pointer group border-none shadow-sm bg-white"
          onClick={() => setActiveView("manage-resources")}
        >
          <CardHeader className="p-4">
            <LinkIcon className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
            <CardTitle className="text-sm">Resource Hub</CardTitle>
            <CardDescription className="text-[10px]">Share materials</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>Track your recent uploads and modifications</CardDescription>
          </CardHeader>
          <CardContent>
            {latestAttendance || qbFiles.length > 0 || pyqFiles.length > 0 || resourceFiles.length > 0 || libraryItems.length > 0 ? (
              <div className="space-y-6">
                {latestAttendance && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <UsersIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Latest Attendance: {latestAttendance.date}</p>
                          <p className="text-xs text-muted-foreground">Marked for {latestAttendance.records.length} students</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setViewMode("attendance");
                        setSelectedAttendanceRecord(latestAttendance);
                        setActiveView("view-records");
                      }}>
                        View Details
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {latestAttendance.records.slice(0, 4).map((record: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <span className="text-xs font-medium truncate max-w-[120px]">{record.studentName}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${record.present ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {record.present ? "Present" : "Absent"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Uploads Status</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[...qbFiles, ...pyqFiles, ...resourceFiles, ...libraryItems]
                      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                      .slice(0, 5)
                      .map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded flex items-center justify-center ${
                              file.category === 'qb' ? 'bg-blue-100 text-blue-600' :
                              file.category === 'pyq' ? 'bg-purple-100 text-purple-600' :
                              file.category === 'library' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
                            }`}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold truncate max-w-[150px]">{file.title}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{file.category} • {file.subject}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {file.status === "pending" ? (
                              <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Settings className="w-3 h-3 animate-spin" /> Pending
                              </span>
                            ) : file.status === "approved" ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Approved
                              </span>
                            ) : (
                              <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> Rejected
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Settings className="w-6 h-6 text-gray-300" />
                </div>
                <p>No recent activity found.</p>
                <p className="text-sm">Start by uploading a question bank or resource.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Overview of your contributions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Question Banks</span>
              <span className="text-xl font-bold text-primary">{qbFiles.length}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">PYQ Papers</span>
              <span className="text-xl font-bold text-primary">{pyqFiles.length}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Resources</span>
              <span className="text-xl font-bold text-primary">{resourceFiles.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
