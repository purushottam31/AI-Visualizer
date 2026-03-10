import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import MermaidDiagram from './components/MermaidDiagram';
import {
  Brain,
  Bell,
  Settings,
  Search,
  ArrowRight,
  Lightbulb,
  Network,
  FileText,
  LayoutTemplate,
  Download,
  Share2,
  Mic,
  MicOff,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export default function App() {
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [diagramCode, setDiagramCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagram' | 'quiz'>('diagram');

  // Quiz States
  const [quizData, setQuizData] = useState<QuizQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [score, setScore] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleExplain = async () => {
    if (!concept) return;
    setIsProcessing(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Explain the concept of "${concept}". Provide a brief overview and a few key points.`
      });
      setExplanation(response.text || '');
    } catch (error) {
      console.error(error);
      setExplanation("Error generating explanation.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateDiagram = async () => {
    if (!concept) return;
    setIsGeneratingDiagram(true);
    setActiveTab('diagram');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create a Mermaid.js diagram illustrating the concept of "${concept}". 
        Return ONLY the raw Mermaid code block without any markdown formatting like \`\`\`mermaid or \`\`\`. Do not include any explanation.
        Use a flowchart or graph that best represents the concept.`
      });
      
      let code = response.text || '';
      // Clean up markdown if the model still includes it
      code = code.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
      setDiagramCode(code);
    } catch (error) {
      console.error(error);
      setDiagramCode("graph TD\n  A[Error] --> B[Failed to generate diagram]");
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!concept) return;
    setIsGeneratingQuiz(true);
    setActiveTab('quiz');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create a 5-question multiple choice quiz testing knowledge on the concept of "${concept}". 
        Return ONLY valid JSON. The JSON should be an array of objects. 
        Each object must have the following properties:
        - "question": string
        - "options": an array of 4 string options
        - "answerIndex": number (0-3), representing the correct index in the options array
        - "explanation": string, a brief explanation of why the answer is correct
        Output absolutely nothing else but the raw JSON.`
      });
      
      let rawText = response.text || '[]';
      rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedQuiz: QuizQuestion[] = JSON.parse(rawText);
      setQuizData(parsedQuiz);
    } catch (error) {
      console.error(error);
      alert("Error generating quiz. Please try again.");
      setQuizData([]);
    } finally {
      setIsGeneratingQuiz(false);
      setUserAnswers({});
      setQuizCompleted(false);
      setScore(0);
    }
  };

  const handleAnswerSelect = (qIndex: number, optIndex: number) => {
    if (userAnswers[qIndex] !== undefined) return; // already answered
    
    // Update answer map
    const newAnswers = { ...userAnswers, [qIndex]: optIndex };
    setUserAnswers(newAnswers);

    // Calculate completion
    if (Object.keys(newAnswers).length === quizData.length) {
      let finalScore = 0;
      quizData.forEach((q, idx) => {
        if (newAnswers[idx] === q.answerIndex) finalScore++;
      });
      setScore(finalScore);
      setQuizCompleted(true);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              parts: [
                { text: 'Listen to this audio. Identify the concept the user is asking about, and provide a clear, concise explanation of that concept. Format with a brief overview and key points.' },
                { inlineData: { mimeType: blob.type, data: base64data } }
              ]
            }
          ]
        });
        
        setExplanation(response.text || 'Could not generate explanation.');
      };
    } catch (error) {
      console.error("Error processing audio:", error);
      setExplanation("Error processing audio request.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearConcept = () => {
    setConcept('');
    setExplanation('');
    setDiagramCode('');
    setQuizData([]);
    setUserAnswers({});
    setQuizCompleted(false);
    setScore(0);
    setActiveTab('diagram');
  };

  const handleDownloadDiagram = () => {
    const svgElement = document.querySelector('#mermaid-container svg');
    if (!svgElement) {
      alert("Please generate a diagram first before downloading.");
      return;
    }
    
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    if (!source.match(/^<\?xml/)) {
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    }

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${concept.replace(/\s+/g, '-').toLowerCase()}-diagram.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handleShareDiagram = async () => {
    if (!diagramCode) {
      alert("Please generate a diagram first before sharing.");
      return;
    }
    try {
      await navigator.clipboard.writeText(diagramCode);
      alert("Diagram code copied to clipboard!");
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert("Failed to copy to clipboard.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f0ec] text-[#4a3b32] font-sans p-6 md:p-10">
      {/* Header */}
      <header className="flex justify-between items-center mb-12 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Brain className="w-9 h-9 text-[#8c4a3b]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#3d2e28]">AI Concept Visualizer</h1>
        </div>
        <div className="flex items-center gap-5">
          <button className="text-[#4a3b32] hover:text-[#8c4a3b] transition-colors">
            <Bell className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#8c5a46] text-white flex items-center justify-center font-semibold shadow-sm">
            ST
          </div>
          <button className="text-[#4a3b32] hover:text-[#8c4a3b] transition-colors">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {/* Search Section */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="relative shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-full flex items-center bg-white">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <Search className="w-6 h-6 text-[#b5a59a]" />
            </div>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
              className="block w-full pl-16 pr-32 py-5 bg-transparent border-none rounded-full text-lg focus:ring-2 focus:ring-[#8c4a3b]/20 outline-none placeholder:text-[#b5a59a]"
              placeholder="Enter a concept"
            />
            <div className="absolute inset-y-2 right-2 flex items-center gap-2">
              <button 
                onClick={handleClearConcept}
                className="px-5 py-3 bg-[#7a3e31] hover:bg-[#633126] transition-colors rounded-full flex items-center justify-center text-white shadow-md h-full font-medium"
                title="Clear Search"
              >
                Clear
              </button>
              <button 
                onClick={toggleRecording}
                className={`p-3 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[#f5f0ec] text-[#7a3e31] hover:bg-[#e6d5c9]'}`}
                title={isRecording ? "Stop Recording" : "Start Voice Assistant"}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button 
                onClick={handleExplain}
                disabled={isProcessing}
                className="px-5 py-3 bg-[#7a3e31] hover:bg-[#633126] disabled:opacity-70 transition-colors rounded-full flex items-center justify-center text-white shadow-md h-full"
                title="Explain Concept"
              >
                {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <button 
            onClick={handleExplain}
            className="flex items-center gap-2 px-6 py-3.5 bg-[#7a3e31] hover:bg-[#633126] text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg">
            <Lightbulb className="w-5 h-5" />
            Explain Concept
          </button>
          <button 
            onClick={handleGenerateDiagram}
            className="flex items-center gap-2 px-6 py-3.5 bg-[#7a3e31] hover:bg-[#633126] text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg">
            <Network className="w-5 h-5" />
            Generate Diagram
          </button>
          <button 
            onClick={handleGenerateQuiz}
            className="flex items-center gap-2 px-6 py-3.5 bg-[#7a3e31] hover:bg-[#633126] text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg">
            <FileText className="w-5 h-5" />
            Create Quiz
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Panel: Explanation */}
          <div className="md:col-span-6 bg-[#e6d5c9] rounded-[2rem] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 px-2">
              <FileText className="w-6 h-6 text-[#4a3b32]" />
              <h2 className="text-xl font-semibold text-[#3d2e28]">Explanation</h2>
            </div>
            
            <div className="bg-white/90 backdrop-blur-sm rounded-[1.5rem] p-8 min-h-[400px] shadow-sm overflow-y-auto max-h-[600px]">
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-[#8c4a3b]">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-medium">Analyzing concept...</p>
                </div>
              ) : explanation ? (
                <div className="prose prose-sm max-w-none text-[#4a3b32] prose-headings:text-[#3d2e28] prose-a:text-[#8c4a3b]">
                  <Markdown>{explanation}</Markdown>
                </div>
              ) : (
                /* Skeleton lines replacing Overview and Key Points */
                <div className="space-y-5 mt-4 opacity-50">
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-full"></div>
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-5/6"></div>
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-4/6"></div>
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-full mt-10"></div>
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-3/4"></div>
                  <div className="h-3.5 bg-[#f0e6df] rounded-full w-5/6"></div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Diagram / Quiz */}
          <div className="md:col-span-6 flex flex-col">
            <div className="flex justify-between items-center mb-4 px-2">
              <div className="flex items-center gap-3">
                <LayoutTemplate className="w-6 h-6 text-[#4a3b32]" />
                <h2 className="text-xl font-semibold text-[#3d2e28]">Diagram / Quiz</h2>
              </div>
              
              {/* Toggle */}
              <div className="flex bg-white rounded-full p-1.5 shadow-sm border border-[#e8ded6]">
                <button 
                  onClick={() => setActiveTab('diagram')}
                  className={`px-6 py-1.5 rounded-full text-sm font-medium transition-colors ${activeTab === 'diagram' ? 'bg-[#c29b8c] text-white shadow-sm' : 'text-[#7a3e31] hover:bg-[#f5f0ec]'}`}>
                  Diagram
                </button>
                <button 
                  onClick={() => setActiveTab('quiz')}
                  className={`px-6 py-1.5 rounded-full text-sm font-medium transition-colors ${activeTab === 'quiz' ? 'bg-[#c29b8c] text-white shadow-sm' : 'text-[#7a3e31] hover:bg-[#f5f0ec]'}`}>
                  Quiz
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-white rounded-[2rem] border-2 border-[#e8ded6] shadow-sm relative overflow-hidden min-h-[400px]">
              {/* Dot Grid Background */}
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(#d5c9c1 2px, transparent 2px)',
                backgroundSize: '30px 30px'
              }}></div>
              
              {/* Diagram Content */}
              <div className="absolute inset-0 z-10">
                {isGeneratingDiagram ? (
                  <div className="flex flex-col items-center justify-center h-full text-[#8c4a3b]">
                    <Loader2 className="w-10 h-10 animate-spin mb-4" />
                    <p className="font-medium">Generating diagram...</p>
                  </div>
                ) : diagramCode && activeTab === 'diagram' ? (
                  <MermaidDiagram chart={diagramCode} />
                ) : activeTab === 'diagram' ? (
                  <div className="flex items-center justify-center h-full text-[#b5a59a]">
                    <p>Enter a concept and click "Generate Diagram"</p>
                  </div>
                ) : quizData.length > 0 && activeTab === 'quiz' ? (
                  <div className="p-8 h-full overflow-y-auto space-y-8 pb-32 relative">
                    {/* Header */}
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-[#3d2e28]">Knowledge Check: {concept}</h3>
                      <p className="text-[#8c5a46]">Answer all 5 questions to view your final score.</p>
                    </div>

                    {/* Questions */}
                    {quizData.map((q, qIndex) => {
                      const isAnswered = userAnswers[qIndex] !== undefined;
                      const isCorrect = userAnswers[qIndex] === q.answerIndex;

                      return (
                        <div key={qIndex} className="bg-[#f5f0ec] p-6 rounded-[1.5rem] border border-[#e8ded6]">
                          <p className="font-semibold text-lg text-[#3d2e28] mb-4">
                            {qIndex + 1}. {q.question}
                          </p>
                          <div className="space-y-3">
                            {q.options.map((opt, optIndex) => {
                              // Determine styling based on selection state
                              const isSelected = userAnswers[qIndex] === optIndex;
                              const isThisOptionCorrect = optIndex === q.answerIndex;
                              
                              let buttonClass = "w-full text-left px-5 py-3.5 rounded-xl transition-all border-2 ";
                              let icon = null;

                              if (!isAnswered) {
                                buttonClass += "bg-white border-transparent hover:border-[#c29b8c] text-[#4a3b32] shadow-sm";
                              } else {
                                if (isThisOptionCorrect) {
                                  // Right answer always gets highlighted green
                                  buttonClass += "bg-green-100 border-green-500 text-green-900";
                                  icon = <CheckCircle2 className="w-5 h-5 text-green-600" />;
                                } else if (isSelected && !isThisOptionCorrect) {
                                  // Wrong selected answer
                                  buttonClass += "bg-red-100 border-red-400 text-red-900";
                                  icon = <XCircle className="w-5 h-5 text-red-500" />;
                                } else {
                                  // Unselected wrong answer
                                  buttonClass += "bg-white border-transparent text-[#b5a59a] opacity-60";
                                }
                              }

                              return (
                                <button
                                  key={optIndex}
                                  onClick={() => handleAnswerSelect(qIndex, optIndex)}
                                  disabled={isAnswered}
                                  className={`${buttonClass} flex justify-between items-center`}
                                >
                                  <span>{opt}</span>
                                  {icon}
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Explanation displays only if answered or finished completely */}
                          {isAnswered && (
                            <div className="mt-4 pt-4 border-t border-[#e8ded6]">
                              <p className={`text-sm ${isCorrect ? 'text-green-800' : 'text-[#8c5a46]'}`}>
                                <span className="font-semibold">{isCorrect ? "Correct!" : "Incorrect."}</span> {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Final Score Section */}
                    {quizCompleted && (
                      <div className="bg-[#c29b8c]/20 p-6 rounded-[1.5rem] border-2 border-[#c29b8c] text-center mt-8">
                        <h4 className="text-2xl font-bold text-[#3d2e28] mb-2">Quiz Completed!</h4>
                        <div className="text-4xl font-black text-[#7a3e31] mb-2">{score} / 5</div>
                        <p className="text-[#8c5a46] font-medium">Review your solutions above.</p>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'quiz' && isGeneratingQuiz ? (
                  <div className="flex flex-col items-center justify-center h-full text-[#8c4a3b]">
                    <Loader2 className="w-10 h-10 animate-spin mb-4" />
                    <p className="font-medium">Generating interactive 5-question quiz...</p>
                  </div>
                ) : activeTab === 'quiz' ? (
                  <div className="flex items-center justify-center h-full text-[#b5a59a]">
                    <p>Enter a concept and click "Create Quiz"</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#b5a59a]">
                    <p>Select a tab above</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end gap-4 mt-6">
              <button 
                onClick={handleDownloadDiagram}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#4a3b32] hover:text-[#7a3e31] rounded-full font-medium shadow-sm border border-[#e8ded6] hover:bg-[#f5f0ec] transition-all">
                <Download className="w-4 h-4" />
                Download
              </button>
              <button 
                onClick={handleShareDiagram}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#4a3b32] hover:text-[#7a3e31] rounded-full font-medium shadow-sm border border-[#e8ded6] hover:bg-[#f5f0ec] transition-all">
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
