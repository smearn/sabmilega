
import React, { useState } from "react";
import { update, ref } from "firebase/database";
import { db } from "../firebase";

const ProfileEditScreen = ({ user, onClose, onUpdate }: any) => {
   const [name, setName] = useState(user.name);
   const [uploading, setUploading] = useState(false);
   const [progress, setProgress] = useState(0);
   
   // Social Links state
   const [socialLink, setSocialLink] = useState(user.socialLink || "");

   const handleSave = async () => {
      await update(ref(db, `users/${user.uid}`), { name, socialLink });
      onUpdate({...user, name, socialLink});
      onClose();
   };

   const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;

      setUploading(true);
      // Fake progress for UX while processing
      setProgress(20);

      const reader = new FileReader();
      reader.onload = (event) => {
         const img = new Image();
         img.onload = async () => {
             setProgress(50);
             const canvas = document.createElement('canvas');
             let width = img.width;
             let height = img.height;
             
             // Resize to max 512x512 to ensure it uploads quickly and fits DB comfortably
             const MAX_SIZE = 512;
             if (width > height) {
                 if (width > MAX_SIZE) {
                     height *= MAX_SIZE / width;
                     width = MAX_SIZE;
                 }
             } else {
                 if (height > MAX_SIZE) {
                     width *= MAX_SIZE / height;
                     height = MAX_SIZE;
                 }
             }
             
             canvas.width = width;
             canvas.height = height;
             
             const ctx = canvas.getContext('2d');
             if(ctx) {
                 ctx.drawImage(img, 0, 0, width, height);
                 // Strip metadata by creating new data URL
                 const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                 setProgress(80);
                 
                 try {
                     await update(ref(db, `users/${user.uid}`), { profilePic: dataUrl });
                     onUpdate({...user, profilePic: dataUrl});
                     setProgress(100);
                 } catch(err: any) {
                     alert("Error saving image: " + err.message);
                 } finally {
                     setUploading(false);
                     setProgress(0);
                 }
             }
         };
         if (event.target?.result) {
            img.src = event.target.result as string;
         }
      };
      reader.readAsDataURL(file);
   };

   const getSocialIcon = (link: string) => {
       if(!link) return "fa-link";
       if(link.includes("facebook")) return "fa-facebook text-blue-600";
       if(link.includes("instagram")) return "fa-instagram text-pink-600";
       if(link.includes("youtube")) return "fa-youtube text-red-600";
       if(link.includes("twitter") || link.includes("x.com")) return "fa-x-twitter text-black";
       if(link.includes("whatsapp")) return "fa-whatsapp text-green-500";
       return "fa-link text-slate-400";
   };

   return (
      <div className="fixed inset-0 bg-white z-[60] flex flex-col animate-[fade-enter_0.3s] overflow-y-auto">
         <div className="p-4 flex items-center justify-between border-b sticky top-0 bg-white z-10">
            <button onClick={onClose} className="text-slate-500 font-bold">Cancel</button>
            <h3 className="font-bold">Edit Profile</h3>
            <button onClick={handleSave} className="text-blue-600 font-bold">Done</button>
         </div>
         <div className="p-8 flex flex-col items-center pb-24">
            <div className="relative mb-8">
               <div className="w-28 h-28 bg-slate-100 rounded-full overflow-hidden border-4 border-white shadow-xl">
                  <img src={user.profilePic || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.username} className="w-full h-full object-cover" />
               </div>
               <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md hover:scale-110 transition">
                  <i className="fa-solid fa-camera text-sm"></i>
                  <input type="file" className="hidden" onChange={handleImageUpload} />
               </label>
            </div>
            
            {uploading && (
               <div className="w-full max-w-xs mb-6">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                     <span>Processing...</span>
                     <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                     <div className="bg-blue-600 h-2 rounded-full transition-all" style={{width: `${progress}%`}}></div>
                  </div>
               </div>
            )}

            <div className="w-full space-y-4">
               <div>
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Full Name</label>
                   <input value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none border-2 border-transparent focus:border-blue-500 mt-1" />
               </div>

               <div>
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Social Link</label>
                   <div className="relative">
                       <i className={`fa-brands ${getSocialIcon(socialLink)} absolute left-4 top-1/2 -translate-y-1/2 text-xl`}></i>
                       <input 
                           value={socialLink} 
                           onChange={e => setSocialLink(e.target.value)} 
                           placeholder="Paste Facebook, Insta, YouTube link"
                           className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none border-2 border-transparent focus:border-blue-500 mt-1" 
                       />
                   </div>
                   <p className="text-[10px] text-slate-400 ml-1 mt-1">Icon auto-detects based on link</p>
               </div>
               
               <div className="opacity-60">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Username</label>
                   <input value={user.username} readOnly className="w-full p-4 bg-slate-100 rounded-xl font-bold text-slate-600 outline-none mt-1" />
               </div>

               {/* Verification Badges */}
               <div className="pt-4 border-t border-slate-100">
                   <h4 className="font-bold text-slate-800 mb-3">Verification</h4>
                   <div className="space-y-3">
                       <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 opacity-60">
                           <div className="flex items-center gap-3">
                               <i className="fa-solid fa-envelope text-slate-400"></i>
                               <div className="flex flex-col">
                                   <span className="text-xs font-bold text-slate-700">Email</span>
                                   <span className="text-[10px] text-slate-400">{user.email}</span>
                               </div>
                           </div>
                           <span className="text-[10px] font-bold bg-slate-200 text-slate-500 px-2 py-1 rounded">Pending</span>
                       </div>
                       <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 opacity-60">
                           <div className="flex items-center gap-3">
                               <i className="fa-solid fa-phone text-slate-400"></i>
                               <div className="flex flex-col">
                                   <span className="text-xs font-bold text-slate-700">Phone</span>
                                   <span className="text-[10px] text-slate-400">{user.phoneNumber}</span>
                               </div>
                           </div>
                           <span className="text-[10px] font-bold bg-slate-200 text-slate-500 px-2 py-1 rounded">Pending</span>
                       </div>
                   </div>
               </div>
            </div>
         </div>
      </div>
   );
};

export default ProfileEditScreen;
