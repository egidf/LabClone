import React from 'react';
import { Track } from '../types';
import { useStore } from '../store';

const TrackHeader = ({ track, onToggleArm, onToggleSolo, onToggleMute }: { 
  track: Track, 
  onToggleArm: () => void, 
  onToggleSolo: () => void, 
  onToggleMute: () => void 
}) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${track.isArmed ? 'bg-red-500' : 'bg-transparent'}`} />
        <div className={`w-1.5 h-1.5 rounded-full ${track.isSolo ? 'bg-blue-500' : 'bg-transparent'}`} />
        <div className={`w-1.5 h-1.5 rounded-full ${track.isMuted ? 'bg-gray-500' : 'bg-transparent'}`} />
        <span className="text-xs font-medium text-white/90">{track.name}</span>
        <span className="text-[9px] text-white/40 uppercase tracking-wider">{track.type}</span>
      </div>
      <div className="flex items-center gap-1">
        <button 
          onClick={onToggleArm} 
          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${track.isArmed ? 'bg-red-600 text-white' : 'bg-white/10 text-white/40'}`}
        >
          A
        </button>
        <button 
          onClick={onToggleSolo} 
          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${track.isSolo ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40'}`}
        >
          S
        </button>
        <button 
          onClick={onToggleMute} 
          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${track.isMuted ? 'bg-gray-600 text-white' : 'bg-white/10 text-white/40'}`}
        >
          M
        </button>
      </div>
    </div>
  );
};

export default function TrackList() {
  const tracks = useStore((s) => s.tracks);

  return (
    <div className="w-72 bg-[#121214] border-r border-white/10 flex flex-col">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#16161a]">
        <h3 className="text-sm font-bold text-white tracking-tight">Tracks</h3>
        <button className="text-[10px] bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded font-bold transition-colors">
          + ADD TRACK
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {tracks.map((track) => (
          <div key={track.id} className="border-b border-white/5 group">
            <TrackHeader 
              track={track} 
              onToggleArm={() => useStore.getState().updateTrackArm(track.id)}
              onToggleSolo={() => useStore.getState().updateTrackSolo(track.id)}
              onToggleMute={() => useStore.getState().updateTrackMute(track.id)}
            />
            <div className="h-32 bg-white/[0.01] relative overflow-hidden">
              {track.clips?.map((clip) => (
                <div 
                  key={clip.id}
                  className="absolute h-full bg-blue-600/20 border border-blue-400/30 rounded-sm shadow-lg"
                  style={{
                    left: `${clip.start * 100}%`,
                    width: `${clip.duration * 100}%`,
                    transition: 'all 0.2s ease-out'
                  }}
                >
                  <div className="w-full h-1 bg-blue-400/50 mt-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
        {tracks.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-white/30 text-xs">No tracks found</p>
          </div>
        )}
      </div>
    </div>
  );
}