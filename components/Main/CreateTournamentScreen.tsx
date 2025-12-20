import React, { useState } from "react";
import { ToastType, UserProfile, Tournament } from "../../types";
import HostMatch from "./HostMatch";
import ManageMatches from "./ManageMatches";

const CreateTournamentScreen = ({ user, showToast, viewMode, setViewMode }: { user: UserProfile, showToast: (m: string, t: ToastType) => void, viewMode: 'manage' | 'create', setViewMode: (m: 'manage' | 'create') => void }) => {
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);

  const handleEdit = (t: Tournament) => {
      setEditingTournament(t);
      setViewMode('create');
  };

  const handleCancelEdit = () => {
      setEditingTournament(null);
      // Stay on create page but reset
  };

  return (
    <>
      {viewMode === 'create' && (
          <HostMatch 
            user={user} 
            showToast={showToast} 
            isEditing={!!editingTournament} 
            initialData={editingTournament} 
            onCancelEdit={handleCancelEdit}
          />
      )}
      {viewMode === 'manage' && (
          <ManageMatches 
            user={user} 
            showToast={showToast} 
            onEdit={handleEdit}
          />
      )}
    </>
  );
};

export default CreateTournamentScreen;