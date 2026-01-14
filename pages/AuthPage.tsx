import React, { useState } from 'react';
import { UserRole, User } from '../types';

interface AuthPageProps {
  onLogin: (user: Partial<User>) => void;
  onBack: () => void;
  allUsers: User[];
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onBack, allUsers }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.PATIENT);
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    age: '',
    bio: '',
    medicalHistory: '',
    bloodGroup: '',
    emergencyContact: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    if (role !== UserRole.PATIENT) {
      setIsRegister(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isRegister) {
      onLogin({
        name: formData.name,
        email: formData.email,
        role: UserRole.PATIENT,
        age: formData.age,
        bio: formData.bio,
        medicalHistory: formData.medicalHistory,
        bloodGroup: formData.bloodGroup,
        emergencyContact: formData.emergencyContact,
        password: formData.password
      });
    } else {
      // Logic for ADMIN is now handled in App.tsx (accepts any credentials)
      // For DOCTOR/PATIENT, it follows existing login logic
      onLogin({
        email: formData.email,
        password: formData.password,
        role: selectedRole
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Decorative Orbs */}
      <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-15%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <button onClick={onBack} className="absolute top-8 left-8 text-slate-400 hover:text-sky-400 flex items-center space-x-3 group font-black uppercase tracking-widest text-[10px] z-20 transition-all">
        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-sm group-hover:-translate-x-1 transition-transform">
           <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg>
        </div>
        <span className="hidden sm:inline tracking-tighter">Back to Lobby</span>
      </button>

      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[48px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] p-8 md:p-14 animate-in zoom-in-95 duration-500 relative z-10 overflow-y-auto max-h-[90vh] border border-white/5">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-sky-500 rounded-[28px] mx-auto mb-6 flex items-center justify-center text-white shadow-2xl shadow-sky-500/30 group">
             <svg viewBox="0 0 24 24" className="w-10 h-10 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L12 22M2 12L22 12M5 5L19 19M19 5L5 19"/></svg>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-3">
            {isRegister ? 'Patient Enrollment' : (selectedRole === UserRole.ADMIN ? 'Admin Command' : 'Secure Entry')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">
            {isRegister ? 'Register your medical node' : `Enter your ${selectedRole.toLowerCase()} credentials`}
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[24px] mb-10">
          {Object.values(UserRole).map((role) => (
            <button 
              key={role} 
              onClick={() => handleRoleChange(role)} 
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[20px] transition-all duration-300 ${selectedRole === role ? 'bg-white dark:bg-sky-500 text-sky-600 dark:text-white shadow-xl' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              {role}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isRegister ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="md:col-span-2">
                <input name="name" required onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400" placeholder="Display Name" />
              </div>
              <div className="md:col-span-1">
                <input name="email" required type="email" onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400" placeholder="Email Address" />
              </div>
              <div className="md:col-span-1">
                <input name="password" required type="password" onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400" placeholder="Arctic Secret Key" />
              </div>
              <div className="md:col-span-2">
                <textarea name="medicalHistory" onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400 h-28 resize-none" placeholder="Medical Ledger Summary..." />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="relative">
                <input name="email" required type="text" onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400 transition-all" placeholder={selectedRole === UserRole.ADMIN ? "Admin ID / Email" : "Email Address"} />
              </div>
              <div className="relative">
                <input name="password" required type="password" onChange={handleChange} className="w-full px-7 py-5 rounded-[24px] border-2 border-slate-50 dark:border-white/5 focus:border-sky-500 focus:outline-none bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-white placeholder:text-slate-400 transition-all" placeholder="Access Password" />
              </div>
            </div>
          )}
          
          <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white py-6 rounded-[24px] font-black text-xs uppercase tracking-[0.3em] transition-all shadow-2xl shadow-sky-500/30 active:scale-[0.97] mb-4">
            {isRegister ? 'Initialize Patient Node' : 'Authorize Session'}
          </button>
        </form>

        {selectedRole === UserRole.PATIENT && (
          <div className="mt-10 text-center border-t border-slate-100 dark:border-white/5 pt-8">
            <p className="text-slate-400 dark:text-slate-500 text-xs font-black uppercase tracking-widest">
              {isRegister ? 'Already archived?' : 'New patient node?'} 
              <button onClick={() => setIsRegister(!isRegister)} className="text-sky-600 dark:text-sky-400 font-black ml-3 hover:underline">
                {isRegister ? 'Login' : 'Create Record'}
              </button>
            </p>
          </div>
        )}

        {selectedRole === UserRole.ADMIN && (
          <div className="mt-10 text-center border-t border-slate-100 dark:border-white/5 pt-8">
            <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest leading-relaxed">
              Root Level Access Granted. <br/> System bypass enabled for Admin nodes.
            </p>
          </div>
        )}

        {selectedRole === UserRole.DOCTOR && (
          <div className="mt-10 text-center border-t border-slate-100 dark:border-white/5 pt-8">
            <p className="text-slate-500 dark:text-slate-400 text-[9px] uppercase font-black tracking-widest leading-relaxed px-6 opacity-60">
              Clinical credentials are provisioned by central hospital administration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;