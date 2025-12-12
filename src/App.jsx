import { useState } from 'react';
import { GraduationCap, Database, BarChart3 } from 'lucide-react';
import FileUpload from './components/FileUpload';
import StudentSearch from './components/StudentSearch';
import Dashboard from './components/Dashboard';
import uvmLogo from './assets/uvm-logo.png';
import './App.css';

function App() {
  const [loadedFiles, setLoadedFiles] = useState({});
  const [gradesData, setGradesData] = useState([]);
  const [criticalityData, setCriticalityData] = useState(null);
  const [curriculumData, setCurriculumData] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [demographicData, setDemographicData] = useState(null);
  const [studentRut, setStudentRut] = useState('');
  const [activeTab, setActiveTab] = useState('upload');

  const handleDataLoaded = (type, data, filename) => {
    setLoadedFiles(prev => ({
      ...prev,
      [type]: { data, filename }
    }));

    switch (type) {
      case 'grades':
        setGradesData(prev => [...prev, ...data]);
        break;
      case 'criticality':
        setCriticalityData(data);
        break;
      case 'curriculum':
        setCurriculumData(data);
        break;
      default:
        // For unknown types, try to add to grades if it has the right structure
        if (Array.isArray(data) && data[0]?.rut) {
          setGradesData(prev => [...prev, ...data]);
        }
    }
  };

  const handleStudentSelect = (records, rut) => {
    setSelectedStudent(records);
    setStudentRut(rut);
    setActiveTab('results');
  };

  const handleDemographicChange = (data) => {
    setDemographicData(data);
  };

  const handleReset = () => {
    setLoadedFiles({});
    setGradesData([]);
    setCriticalityData(null);
    setCurriculumData(null);
    setSelectedStudent(null);
    setDemographicData(null);
    setStudentRut('');
    setActiveTab('upload');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <img src={uvmLogo} alt="UVM Logo" className="logo-image" />
            <div className="logo-text">
              <h1>UVM Analytics</h1>
              <p>Sistema de Analítica Académica - Kinesiología</p>
            </div>
          </div>

          <nav className="header-nav">
            <button
              className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <Database size={18} />
              Datos
            </button>
            <button
              className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
              disabled={gradesData.length === 0}
            >
              <BarChart3 size={18} />
              Consulta
            </button>
            <button
              className={`nav-tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
              disabled={!selectedStudent}
            >
              <GraduationCap size={18} />
              Resultados
            </button>
          </nav>

          {(gradesData.length > 0 || Object.keys(loadedFiles).length > 0) && (
            <button className="btn btn-ghost" onClick={handleReset}>
              Reiniciar
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {activeTab === 'upload' && (
            <div className="tab-content fade-in">
              <FileUpload
                onDataLoaded={handleDataLoaded}
                loadedFiles={loadedFiles}
              />

              {gradesData.length > 0 && (
                <div className="action-prompt">
                  <p>✓ Datos cargados correctamente</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab('search')}
                  >
                    Continuar a Consulta
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="tab-content fade-in">
              <StudentSearch
                gradesData={gradesData}
                onStudentSelect={handleStudentSelect}
                onDemographicChange={handleDemographicChange}
              />
            </div>
          )}

          {activeTab === 'results' && (
            <div className="tab-content fade-in">
              <Dashboard
                studentRecords={selectedStudent}
                criticalityData={criticalityData}
                curriculumData={curriculumData}
                demographicData={demographicData}
                studentRut={studentRut}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>Universidad Viña del Mar • Escuela de Kinesiología • Sistema de Analítica Académica</p>
      </footer>
    </div>
  );
}

export default App;
