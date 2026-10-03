# Pinpoint Revision Tool Code Export

## `src/components/InspireReview/index.jsx`
```javascript
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, List, LogOut } from 'lucide-react';
import Overlay from './Overlay';
import Pin from './Pin';
import Sidebar from './Sidebar';
import { getRevisions, saveRevision, deleteRevision } from './db';
import idcLogoWhite from '../../assets/idc_master_logo_white.svg';
import './index.css';

export default function InspireReview({ currentPage = 'Home', setCurrentPage }) {
  const [isActive, setIsActive] = useState(false);
  const [isPinMode, setIsPinMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [selectedPinId, setSelectedPinId] = useState(null);

  // Initialize and check for activation triggers
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hasTrigger = queryParams.get('feedback') === 'inspire';
    const isSessionActive = localStorage.getItem('inspire_review_active') === 'true';

    if (hasTrigger) {
      localStorage.setItem('inspire_review_active', 'true');
      setIsActive(true);
      
      // Clean up URL parameter to hide from end-users, but keep review active
      queryParams.delete('feedback');
      const newRelativePathQuery = window.location.pathname + (queryParams.toString() ? '?' + queryParams.toString() : '');
      window.history.replaceState(null, '', newRelativePathQuery);
    } else if (isSessionActive) {
      setIsActive(true);
    }
  }, []);

  // Fetch revisions when review mode is active
  useEffect(() => {
    if (!isActive) return;

    const loadData = async () => {
      const data = await getRevisions();
      setRevisions(data);
    };

    loadData();
  }, [isActive]);

  if (!isActive) return null;

  const handleExitReview = () => {
    localStorage.removeItem('inspire_review_active');
    setIsActive(false);
    // Reload to guarantee client code runs clean
    window.location.reload();
  };

  const handleCaptureCoordinate = (x, y) => {
    // Generate a temporary new pin object
    const tempPin = {
      id: 'temp_new_pin',
      x_coord: x,
      y_coord: y,
      page_path: currentPage,
      comment: '',
      author: '',
      priority: 'medium',
      isNew: true // custom flag to load edit state directly
    };

    setRevisions((prev) => [...prev.filter(r => r.id !== 'temp_new_pin'), tempPin]);
    setSelectedPinId('temp_new_pin');
    setIsPinMode(false);
  };

  const handleSavePin = async (savedPin) => {
    // Strip our custom temp flag
    const pinToSave = { ...savedPin };
    delete pinToSave.isNew;
    
    // Strip temporary ID so db.js knows it's a new pin rather than overwriting
    if (pinToSave.id === 'temp_new_pin') {
      delete pinToSave.id;
    }
    
    // If it was the temp pin, remove it from list first before save refreshes state
    setRevisions(prev => prev.filter(r => r.id !== 'temp_new_pin'));

    try {
      await saveRevision(pinToSave);
      const data = await getRevisions();
      setRevisions(data);
      setSelectedPinId(null);
    } catch (error) {
      console.error('Failed to save revision:', error);
    }
  };

  const handleDeletePin = async (id) => {
    if (id === 'temp_new_pin') {
      setRevisions(prev => prev.filter(r => r.id !== 'temp_new_pin'));
      setSelectedPinId(null);
      return;
    }

    try {
      await deleteRevision(id);
      const data = await getRevisions();
      setRevisions(data);
      if (selectedPinId === id) setSelectedPinId(null);
    } catch (error) {
      console.error('Failed to delete revision:', error);
    }
  };

  // Move an existing pin to a new viewport-% position (drag-to-reposition)
  const handleMovePin = async (id, newXpct, newYpct) => {
    if (id === 'temp_new_pin') {
      setRevisions(prev =>
        prev.map(r =>
          r.id === 'temp_new_pin'
            ? { ...r, x_coord: newXpct, y_coord: newYpct }
            : r
        )
      );
      return;
    }

    // Optimistic local update so drag feels instant
    setRevisions(prev =>
      prev.map(r =>
        r.id === id ? { ...r, x_coord: newXpct, y_coord: newYpct } : r
      )
    );

    try {
      const pin = revisions.find(r => r.id === id);
      if (!pin) return;
      await saveRevision({ ...pin, x_coord: newXpct, y_coord: newYpct });
    } catch (error) {
      console.error('Failed to save moved pin:', error);
    }
  };

  // Filter revisions to only show pins matching the current active page layout
  const currentPageRevisions = revisions.filter(
    (r) => r.page_path === currentPage || r.id === 'temp_new_pin'
  );

  // Sorting helper for rendering correct index numbers on pins
  const getPinIndexNumber = (id) => {
    const sorted = [...revisions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const index = sorted.findIndex(r => r.id === id);
    return index !== -1 ? index + 1 : revisions.length;
  };

  // HTML layout we'll inject directly into document.body
  const overlayPortalLayout = (
    <div className="inspire-rev-root">
      {/* 1. Full document absolute container for rendering pins */}
      <div className="inspire-rev-global-overlay-wrapper">
        {currentPageRevisions.map((rev) => (
          <Pin
            key={rev.id}
            pin={rev}
            index={getPinIndexNumber(rev.id)}
            isSelected={selectedPinId === rev.id}
            onSelect={setSelectedPinId}
            onSave={handleSavePin}
            onDelete={handleDeletePin}
            onMove={handleMovePin}
            isNewInitial={rev.id === 'temp_new_pin'}
          />
        ))}
      </div>

      {/* 2. Interactive viewport interceptor (only when clicking new pin) */}
      <Overlay
        isActive={isPinMode}
        onCapture={handleCaptureCoordinate}
        onClose={() => setIsPinMode(false)}
      />

      {/* 3. Slide-out panel list of reviews */}
      <Sidebar
        revisions={revisions}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        selectedPinId={selectedPinId}
        onSelectPin={(id) => {
          setSelectedPinId(id);
          const pin = revisions.find(r => r.id === id);
          if (pin && pin.page_path !== currentPage && setCurrentPage) {
            setCurrentPage(pin.page_path);
          }
        }}
        onDeletePin={handleDeletePin}
      />

      {/* 4. Top Status Badge (Mobile only) */}
      <div className="inspire-rev-status-badge-mobile">
        <div className="inspire-rev-status-dot" />
        <span className="inspire-rev-status-text-mobile" style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Review Active
        </span>
      </div>

      {/* 5. Bottom Center Control Bar */}
      <div className="inspire-rev-control-bar">
        <div className="inspire-rev-logo-group" style={{ borderRight: '1px solid rgba(255, 255, 255, 0.15)', paddingRight: '16px', display: 'flex', alignItems: 'center' }}>
          <img src={idcLogoWhite} style={{ width: '130px', height: 'auto', display: 'block' }} alt="Inspire Designs Collective" />
        </div>
        <div className="inspire-rev-status-wrapper">
          <div className="inspire-rev-status-dot" />
          <span className="inspire-rev-status-text" style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '0.02em' }}>
            Review Active
          </span>
        </div>

        <div className="inspire-rev-actions">
          <button 
            className={`inspire-rev-btn inspire-rev-btn-primary ${isPinMode ? 'inspire-rev-active' : ''}`}
            onClick={() => {
              setIsPinMode(!isPinMode);
              setSelectedPinId(null);
            }}
            title={isPinMode ? 'Click on Screen' : 'Drop Pin'}
          >
            <MapPin size={14} />
            <span className="inspire-rev-btn-label">
              {isPinMode ? 'Click on Screen' : 'Drop Pin'}
            </span>
          </button>
          
          <button 
            className={`inspire-rev-btn inspire-rev-btn-revisions ${isSidebarOpen ? 'inspire-rev-active' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={`Revisions (${revisions.length})`}
          >
            <List size={14} />
            <span className="inspire-rev-btn-label">Revisions </span>
            <span>({revisions.length})</span>
          </button>

          <button 
            className="inspire-rev-btn inspire-rev-btn-text" 
            onClick={handleExitReview}
            title="Turn off Review Mode"
          >
            <LogOut size={14} />
            <span className="inspire-rev-btn-label">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlayPortalLayout, document.body);
}
```

## `src/components/InspireReview/Overlay.jsx`
```javascript
import React, { useEffect, useState } from 'react';

export default function Overlay({ isActive, onCapture, onClose }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive, onClose]);

  if (!isActive) return null;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Store as % of FULL DOCUMENT (scroll-aware) so pins stick to the page.
    // e.pageX / e.pageY already include the scroll offset.
    const docW = document.documentElement.scrollWidth;
    const docH = document.documentElement.scrollHeight;

    const xPercent = (e.pageX / docW) * 100;
    const yPercent = (e.pageY / docH) * 100;

    onCapture(xPercent, yPercent);
  };

  return (
    <div
      className="inspire-rev-capture-overlay"
      onClick={handleClick}
    >
      <div
        className="inspire-rev-capture-indicator"
        style={{
          left: `${mousePos.x}px`,
          top:  `${mousePos.y}px`,
          position: 'fixed',
          transform: 'translate(15px, 15px)',
        }}
      >
        📍 Click to drop pin (Esc to cancel)
      </div>
    </div>
  );
}
```

## `src/components/InspireReview/Pin.jsx`
```javascript
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Trash2, X, Check, Edit2 } from 'lucide-react';

/**
 * Converts document-% coordinates to current viewport-pixel position.
 * Both coordinates are stored as % of full document (scroll-aware) and then
 * converted to viewport pixels at render time so pins stick to the page.
 */
function docPctToViewportPx(xPct, yPct) {
  const docW = document.documentElement.scrollWidth;
  const docH = document.documentElement.scrollHeight;
  return {
    x: (xPct / 100) * docW - window.scrollX,
    y: (yPct / 100) * docH - window.scrollY,
  };
}

export default function Pin({
  pin,
  index,
  isSelected,
  onSelect,
  onSave,
  onDelete,
  onMove,
  isNewInitial = false,
}) {
  const [isEditing, setIsEditing] = useState(isNewInitial);
  const [comment,   setComment]   = useState(pin.comment   || '');
  const [author,    setAuthor]    = useState(pin.author    || '');
  const [priority,  setPriority]  = useState(pin.priority  || 'medium');

  // Document-% position (persisted format)
  const [docPos, setDocPos] = useState({ x: pin.x_coord, y: pin.y_coord });

  // Viewport-pixel position used only for rendering
  const [vpPx, setVpPx] = useState(() => docPctToViewportPx(pin.x_coord, pin.y_coord));

  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef(null);
  const pinRef = useRef(null);

  // ── Sync from parent when pin prop changes ────────────────
  useEffect(() => {
    setComment(pin.comment   || '');
    setAuthor(pin.author     || '');
    setPriority(pin.priority || 'medium');
    setDocPos({ x: pin.x_coord, y: pin.y_coord });
  }, [pin]);

  useEffect(() => {
    if (isSelected && isNewInitial) setIsEditing(true);
  }, [isSelected, isNewInitial]);

  // ── Scroll listener: recompute viewport position on every scroll ──
  useLayoutEffect(() => {
    const update = () => setVpPx(docPctToViewportPx(docPos.x, docPos.y));
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [docPos]);

  // ── Drag: pointerdown on the pin bubble starts a drag ────
  const handlePointerDown = useCallback((e) => {
    // Only allow dragging when pin popover is open
    if (!isSelected && !isEditing) return;
    e.stopPropagation();
    e.preventDefault();

    dragStartRef.current = {
      startVpX: vpPx.x,
      startVpY: vpPx.y,
      pointerX: e.clientX,
      pointerY: e.clientY,
    };

    setDragging(true);
    pinRef.current?.setPointerCapture(e.pointerId);
  }, [isSelected, isEditing, vpPx]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging || !dragStartRef.current) return;
    e.stopPropagation();

    const { startVpX, startVpY, pointerX, pointerY } = dragStartRef.current;
    const dx = e.clientX - pointerX;
    const dy = e.clientY - pointerY;

    const newVpX = startVpX + dx;
    const newVpY = startVpY + dy;

    // Convert viewport px → document % (account for current scroll)
    const docW = document.documentElement.scrollWidth;
    const docH = document.documentElement.scrollHeight;
    const newXpct = Math.min(100, Math.max(0, ((newVpX + window.scrollX) / docW) * 100));
    const newYpct = Math.min(100, Math.max(0, ((newVpY + window.scrollY) / docH) * 100));

    setDocPos({ x: newXpct, y: newYpct });
    // vpPx auto-updates via the scroll/docPos effect
  }, [dragging]);

  const handlePointerUp = useCallback((e) => {
    if (!dragging) return;
    e.stopPropagation();
    setDragging(false);
    dragStartRef.current = null;
    if (onMove) onMove(pin.id, docPos.x, docPos.y);
  }, [dragging, docPos, onMove, pin.id]);

  // ── Click selects the pin ─────────────────────────────────
  const handlePinClick = (e) => {
    if (dragging) return;
    e.stopPropagation();
    onSelect(pin.id);
  };

  const handleSave = (e) => {
    e.stopPropagation();
    if (!comment.trim()) return;
    onSave({
      ...pin,
      x_coord:  docPos.x,
      y_coord:  docPos.y,
      comment,
      author:   author.trim() || 'Client',
      priority,
    });
    setIsEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(pin.id);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    if (isNewInitial) {
      onDelete(pin.id);
    } else {
      setComment(pin.comment   || '');
      setAuthor(pin.author     || '');
      setPriority(pin.priority || 'medium');
      setDocPos({ x: pin.x_coord, y: pin.y_coord });
      setIsEditing(false);
    }
  };

  return (
    <div
      className="inspire-rev-pin-container"
      style={{
        position: 'fixed',
        left: `${vpPx.x}px`,
        top:  `${vpPx.y}px`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',   /* override wrapper's pointer-events:none */
        zIndex: 999995,
      }}
    >
      {/* The pin bubble — drag handle when popover is open */}
      <div
        ref={pinRef}
        className={`inspire-rev-pin inspire-rev-pin-priority-${priority} ${isSelected ? 'inspire-rev-selected' : ''} ${dragging ? 'inspire-rev-pin-dragging' : ''}`}
        onClick={handlePinClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: isSelected ? (dragging ? 'grabbing' : 'grab') : 'pointer' }}
        title={isSelected ? 'Drag to reposition' : `Pin #${index}: ${pin.comment}`}
      >
        {index}
      </div>

      {/* Subtle drag hint shown when popover is open but not dragging */}
      {isSelected && !dragging && (
        <div className="inspire-rev-drag-hint">↕ drag to move</div>
      )}

      {/* Popover */}
      {isSelected && (
        <div
          className="inspire-rev-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inspire-rev-popover-header">
            <span className="inspire-rev-popover-title">
              {isEditing ? `Pin #${index} — New Revision` : `Pin #${index}`}
            </span>
            <button className="inspire-rev-close-btn" onClick={handleCancel}>
              <X size={14} />
            </button>
          </div>

          {isEditing ? (
            /* ── EDIT / CREATE FORM ─────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="inspire-rev-form-group">
                <label className="inspire-rev-form-label">Your Name</label>
                <input
                  type="text"
                  className="inspire-rev-input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g. Mike (Client)"
                />
              </div>

              <div className="inspire-rev-form-group">
                <label className="inspire-rev-form-label">Revision Request</label>
                <textarea
                  className="inspire-rev-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Describe what you want changed here..."
                />
              </div>

              <div className="inspire-rev-form-group">
                <label className="inspire-rev-form-label">Priority</label>
                <select
                  className="inspire-rev-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low — Nice to have</option>
                  <option value="medium">Medium — Normal revision</option>
                  <option value="high">High — Fix immediately</option>
                </select>
              </div>

              <div className="inspire-rev-popover-actions">
                <button className="inspire-rev-btn" onClick={handleCancel}>
                  Cancel
                </button>
                <button
                  className="inspire-rev-btn inspire-rev-btn-primary"
                  onClick={handleSave}
                  disabled={!comment.trim()}
                  style={{ opacity: comment.trim() ? 1 : 0.6 }}
                >
                  <Check size={14} /> Save Pin
                </button>
              </div>
            </div>
          ) : (
            /* ── READ-ONLY VIEW ─────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="inspire-rev-form-label">Requested by:</span>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                  {pin.author || 'Client'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="inspire-rev-form-label">Comment:</span>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.4', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                  {pin.comment}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span className={`inspire-rev-card-priority inspire-rev-prio-${priority}`}>
                  {priority}
                </span>
                <div className="inspire-rev-popover-actions">
                  <button
                    className="inspire-rev-btn"
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  <button
                    className="inspire-rev-btn"
                    onClick={handleDelete}
                    style={{ color: 'var(--inspire-danger)', borderColor: 'rgba(239,68,68,0.2)' }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## `src/components/InspireReview/Sidebar.jsx`
```javascript
import React from 'react';
import { X, Download, Trash2, MapPin } from 'lucide-react';
import idcLogoColor from '../../assets/idc_master_logo.svg';
import idcIcon from '../../assets/idc_brandmark_icon.svg';

export default function Sidebar({
  revisions,
  isOpen,
  onClose,
  selectedPinId,
  onSelectPin,
  onDeletePin
}) {
  const handleDownloadReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups for this site to export the report.');
      return;
    }

    // Group revisions by page path
    const pages = {};
    revisions.forEach(rev => {
      const page = rev.page_path || 'General';
      if (!pages[page]) pages[page] = [];
      pages[page].push(rev);
    });

    const dateStr = new Date().toLocaleDateString();

    const getPinIndexNumber = (id) => {
      const sorted = [...revisions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const index = sorted.findIndex(r => r.id === id);
      return index !== -1 ? index + 1 : '?';
    };

    let reportHtml = `
      <html>
        <head>
          <title>Inspire Designs - Client Revision Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap');
            
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .no-print {
                display: none;
              }
            }

            body {
              font-family: 'Public Sans', sans-serif;
              color: #1a1a1a;
              margin: 0;
              padding: 40px;
              /* Soft ambient glow from the top-left corner using a brand hue (Electric Blue), capped low */
              background: radial-gradient(circle at top left, rgba(47, 128, 237, 0.06) 0%, rgba(142, 84, 233, 0.03) 30%, #ffffff 70%);
              background-attachment: fixed;
            }

            .accent-bar {
              width: 100%;
              height: 6px;
              background: linear-gradient(135deg, #2F80ED 0%, #8E54E9 44%, #E34C89 65%, #FF7F50 100%);
              border-radius: 3px;
              margin-bottom: 24px;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #f3f4f6;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }

            .logo-section {
              display: flex;
              flex-direction: column;
            }

            .logo-text {
              font-size: 20px;
              font-weight: 700;
              letter-spacing: 0.02em;
              text-transform: uppercase;
              color: #1a1a1a;
            }

            .logo-collective {
              font-size: 10px;
              font-weight: 500;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              color: #FF7F50;
              margin-top: 3px;
            }

            .meta-section {
              text-align: right;
              font-size: 13px;
              color: #4b5563;
              line-height: 1.5;
            }

            .report-title {
              font-size: 26px;
              font-weight: 700;
              margin: 0 0 10px 0;
              color: #1a1a1a;
            }

            .page-group {
              margin-bottom: 35px;
              page-break-inside: avoid;
            }

            .page-title {
              font-size: 16px;
              font-weight: 700;
              color: #8E54E9;
              background: #f5f3ff;
              padding: 8px 12px;
              border-radius: 6px;
              margin: 0 0 16px 0;
              border-left: 4px solid #8E54E9;
            }

            .cards-container {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            .revision-card {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 16px;
              background: #ffffff;
            }

            .card-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }

            .pin-identity {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .pin-num {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 22px;
              height: 22px;
              background: #8E54E9;
              color: #ffffff;
              font-size: 12px;
              font-weight: 700;
              border-radius: 50%;
            }

            .author {
              font-size: 13px;
              font-weight: 600;
              color: #374151;
            }

            .priority {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 3px 8px;
              border-radius: 4px;
            }

            .prio-low { background: #f3f4f6; color: #4b5563; }
            .prio-medium { background: #e0e7ff; color: #4f46e5; }
            .prio-high { background: #fce7f3; color: #db2777; }

            .comment {
              font-size: 14px;
              line-height: 1.6;
              color: #1f2937;
              margin: 0 0 12px 0;
              white-space: pre-wrap;
            }

            .coordinates {
              font-size: 11px;
              color: #9ca3af;
              display: flex;
              align-items: center;
              gap: 4px;
            }

            .footer {
              margin-top: 60px;
              border-top: 1px solid #e5e7eb;
              padding-top: 24px;
              text-align: center;
              font-size: 12px;
              color: #9ca3af;
              line-height: 1.5;
            }

            .print-prompt {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              background: #1a1a1a;
              color: #ffffff;
              padding: 10px 20px;
              border-radius: 9999px;
              font-size: 13px;
              font-weight: 600;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              z-index: 9999;
              display: flex;
              align-items: center;
              gap: 12px;
            }

            .print-btn {
              background: #8E54E9;
              color: white;
              border: none;
              padding: 4px 12px;
              border-radius: 9999px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              transition: background 0.15s;
            }

            .print-btn:hover {
              background: #7c3aed;
            }
          </style>
        </head>
        <body>
          <div class="print-prompt no-print">
            <span>Report generated! Ready to print/save.</span>
            <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
          </div>

          <div class="accent-bar"></div>
          
          <div class="header">
            <div class="logo-section">
              <img src="\${window.location.origin}\${idcLogoColor}" style="width: 160px; height: auto; display: block;" alt="Inspire Designs Collective" />
            </div>
            
            <div class="meta-section">
              <strong>PROJECT REVISION REPORT</strong><br />
              Client: Cal Industries<br />
              Date: \${dateStr}<br />
              Total Items: \${revisions.length}
            </div>
          </div>

          <h2 class="report-title">Website Feedback Summary</h2>
          <p style="color: #4b5563; font-size: 14px; margin-top: 0; margin-bottom: 30px; line-height: 1.5;">
            This report contains the layout notes and revision requests generated by the client using the Inspire Designs Client Review Portal.
          </p>

          <div class="pin-list">
            \${Object.keys(pages).map(pagePath => \`
              <div class="page-group">
                <h3 class="page-title">Page: \${pagePath}</h3>
                <div class="cards-container">
                  \${pages[pagePath].map(rev => \`
                    <div class="revision-card">
                      <div class="card-header">
                        <div class="pin-identity">
                          <span class="pin-num">\${getPinIndexNumber(rev.id)}</span>
                          <span class="author">By \${rev.author || 'Client'}</span>
                        </div>
                        <span class="priority prio-\${rev.priority}">\${rev.priority}</span>
                      </div>
                      <p class="comment">\${rev.comment}</p>
                      <div class="coordinates">
                        📍 Page Coordinates: X: \${Math.round(rev.x_coord)}%, Y: \${Math.round(rev.y_coord)}%
                      </div>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \`).join('')}
          </div>

          <div class="footer">
            <strong>Inspire Designs Collective</strong><br />
            Intentional &middot; Faithful &middot; Timely &middot; 2026 Edition<br />
            <span style="font-size: 10px; color: #9ca3af; margin-top: 4px; display: block;">Report generated natively via Inspire Designs Client Review Portal.</span>
          </div>

          <script>
            // Automatically prompt print dialog on load
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            }
          </script>
        </body>
      </html>
    \`;

    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  const getPinNumber = (id) => {
    const sorted = [...revisions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const index = sorted.findIndex(r => r.id === id);
    return index !== -1 ? index + 1 : '?';
  };

  return (
    <div className={\`inspire-rev-sidebar \${isOpen ? 'inspire-rev-open' : ''}\`}>
      <div className="inspire-rev-sidebar-header">
        <div className="inspire-rev-sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={idcIcon} style={{ width: '28px', height: '28px', display: 'block' }} alt="IDC Logo Icon" />
          <span style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '0.05em', color: 'var(--inspire-white)', textTransform: 'uppercase' }}>Revisions</span>
          <span className="inspire-rev-sidebar-count">{revisions.length}</span>
        </div>
        <button className="inspire-rev-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="inspire-rev-sidebar-content">
        {revisions.length === 0 ? (
          <div className="inspire-rev-empty">
            <MapPin className="inspire-rev-empty-icon" />
            <p style={{ margin: '8px 0 0 0', fontWeight: '500' }}>No pins placed yet</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--inspire-text-muted)' }}>
              Click "Drop Pin" in the toolbar to place feedback on any part of the site.
            </p>
          </div>
        ) : (
          [...revisions]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((rev) => {
              const pinNum = getPinNumber(rev.id);
              const isSelected = selectedPinId === rev.id;
              
              return (
                <div 
                  key={rev.id} 
                  className={\`inspire-rev-card \${isSelected ? 'inspire-rev-selected-card' : ''}\`}
                  style={isSelected ? { borderColor: 'var(--inspire-primary)', background: 'rgba(99, 102, 241, 0.08)' } : {}}
                  onClick={() => onSelectPin(rev.id)}
                >
                  <div className="inspire-rev-card-header">
                    <div className="inspire-rev-card-meta">
                      <span className="inspire-rev-card-badge">{pinNum}</span>
                      <span className="inspire-rev-card-page" title={rev.page_path}>
                        {rev.page_path}
                      </span>
                    </div>
                    <span className={\`inspire-rev-card-priority inspire-rev-prio-\${rev.priority}\`}>
                      {rev.priority}
                    </span>
                  </div>

                  <p className="inspire-rev-card-comment">{rev.comment}</p>

                  <div className="inspire-rev-card-footer">
                    <span className="inspire-rev-card-author">
                      By: {rev.author || 'Client'}
                    </span>
                    <div className="inspire-rev-card-actions">
                      <button 
                        className="inspire-rev-card-btn inspire-rev-card-btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePin(rev.id);
                        }}
                        title="Delete comment"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>

      <div className="inspire-rev-sidebar-footer">
        <button 
          className="inspire-rev-btn inspire-rev-btn-primary" 
          onClick={handleDownloadReport}
          disabled={revisions.length === 0}
          style={{ width: '100%', gap: '8px', padding: '10px 0', opacity: revisions.length === 0 ? 0.6 : 1 }}
        >
          <Download size={16} /> Export Revision PDF
        </button>
        
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--inspire-text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
          Feedback panel powered by **Inspire Designs**.<br />
          Revisions save to this browser.
        </p>
      </div>
    </div>
  );
}
```

## `src/components/InspireReview/db.js`
```javascript
// Local storage key for comments
const STORAGE_KEY = 'inspire_revisions_cal_industries';
const CLIENT_ID = 'cal_industries';

// Helper to generate a simple unique ID
const generateId = () => {
  return Math.random().toString(36).substring(2, 9) + '_' + Date.now();
};

const defaultRevisions = [
  { id: 'rev1', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:00:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Services', comment: 'Change the location from Sanford, FL to Oviedo, FL for SEO purposes.', x_coord: 59, y_coord: 83 },
  { id: 'rev2', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:01:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Services', comment: 'Update photo.', x_coord: 52, y_coord: 60 },
  { id: 'rev3', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:02:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Services', comment: 'Update photo', x_coord: 66, y_coord: 36 },
  { id: 'rev4', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:03:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Services', comment: 'Update photo', x_coord: 59, y_coord: 24 },
  { id: 'rev5', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:04:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'About', comment: 'Change the location to Oviedo, FL', x_coord: 36, y_coord: 8 },
  { id: 'rev6', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:05:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'About', comment: 'Check the bold for “About Cal”\\nAlso, drop Cal Industries” below the “About”', x_coord: 52, y_coord: 5 },
  { id: 'rev7', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:06:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'About', comment: 'Also change location to Oviedo, FL', x_coord: 58, y_coord: 77 },
  { id: 'rev8', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:07:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Membership', comment: 'Change location to Oviedo, FL', x_coord: 56, y_coord: 85 },
  { id: 'rev9', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:08:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Contact', comment: 'Change location to main location Oviedo, FL and surrounding areas', x_coord: 50, y_coord: 18 },
  { id: 'rev10', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:09:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Contact', comment: 'Change to Oviedo, FL and Surrounding areas', x_coord: 61, y_coord: 82 },
  { id: 'rev11', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:10:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Home', comment: 'Update b roll', x_coord: 81, y_coord: 14 },
  { id: 'rev12', client_id: CLIENT_ID, created_at: new Date('2026-08-10T10:11:00Z').toISOString(), status: 'pending', priority: 'medium', author: 'Calvin', page_path: 'Home', comment: 'There are multiple “before/after” stated. Remove one', x_coord: 75, y_coord: 46 },
];

/**
 * Fetch all comments from storage.
 */
export const getRevisions = async () => {
  try {
    let data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultRevisions));
      data = JSON.stringify(defaultRevisions);
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error fetching revisions from localStorage:', error);
    return [];
  }
};

/**
 * Save a single comment (create if new, update if existing).
 */
export const saveRevision = async (revision) => {
  try {
    const revisions = await getRevisions();
    let updatedRevision = { ...revision };

    if (!updatedRevision.id) {
      // Create new comment
      updatedRevision.id = generateId();
      updatedRevision.client_id = CLIENT_ID;
      updatedRevision.created_at = new Date().toISOString();
      updatedRevision.status = updatedRevision.status || 'pending';
      updatedRevision.priority = updatedRevision.priority || 'medium';
      revisions.push(updatedRevision);
    } else {
      // Update existing comment
      const index = revisions.findIndex(r => r.id === updatedRevision.id);
      if (index !== -1) {
        revisions[index] = { ...revisions[index], ...updatedRevision };
      } else {
        revisions.push(updatedRevision);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(revisions));
    return updatedRevision;
  } catch (error) {
    console.error('Error saving revision to localStorage:', error);
    throw error;
  }
};

/**
 * Delete a revision by ID.
 */
export const deleteRevision = async (id) => {
  try {
    const revisions = await getRevisions();
    const filtered = revisions.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting revision from localStorage:', error);
    throw error;
  }
};

/**
 * Formats revisions into a clean, readable text report.
 */
export const exportRevisionsText = (revisions) => {
  if (!revisions || revisions.length === 0) {
    return 'No revisions found for Cal Industries.';
  }

  let report = `=========================================
INSPIRE DESIGNS - CLIENT REVISION REPORT
Project: Cal Industries
Generated: \${new Date().toLocaleString()}
Total Revisions: \${revisions.length}
=========================================\n\n`;

  // Group by page path for clean organization
  const pages = {};
  revisions.forEach(rev => {
    const page = rev.page_path || 'General / Unknown Page';
    if (!pages[page]) pages[page] = [];
    pages[page].push(rev);
  });

  Object.keys(pages).forEach(pagePath => {
    report += `PAGE: \${pagePath}\n`;
    report += `-----------------------------------------\n`;
    
    pages[pagePath].forEach((rev, index) => {
      const date = new Date(rev.created_at).toLocaleDateString();
      report += `[Pin #\${index + 1}] [Priority: \${rev.priority.toUpperCase()}] [Status: \${rev.status.toUpperCase()}]\n`;
      report += `Author: \${rev.author || 'Client (Anonymous)'}\n`;
      report += `Comment: \${rev.comment}\n`;
      report += `Location on screen: X: \${Math.round(rev.x_coord)}%, Y: \${Math.round(rev.y_coord)}%\n`;
      report += `Created: \${date}\n\n`;
    });
    
    report += `\n`;
  });

  return report;
};
```

## `src/components/InspireReview/index.css`
```css
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap');

/* ── Namespace root: all CSS vars scoped here ──────────────── */
.inspire-rev-root {
  --inspire-font: 'Public Sans', system-ui, sans-serif;
  --inspire-blue: #2F80ED;
  --inspire-violet: #8E54E9;
  --inspire-pink: #E34C89;
  --inspire-coral: #FF7F50;
  --inspire-charcoal: #1A1A1A;
  --inspire-slate-gray: #4B5563;
  --inspire-light-gray: #E5E7EB;
  --inspire-white: #FFFFFF;
  --inspire-danger: #EF4444;
  --inspire-text-muted: #6B7280;

  /* 135deg brand gradient */
  --inspire-gradient: linear-gradient(135deg,
    var(--inspire-blue)   0%,
    var(--inspire-blue)  25%,
    var(--inspire-violet) 44%,
    var(--inspire-pink)   65%,
    var(--inspire-coral)  90%,
    var(--inspire-coral) 100%);

  --inspire-bg-glass: rgba(26, 26, 26, 0.88);
  --inspire-border-glass: rgba(255, 255, 255, 0.08);
  --inspire-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5);
  --inspire-shadow-accent: 0 0 15px rgba(142, 84, 233, 0.4);

  font-family: var(--inspire-font);
  color-scheme: dark;
}

/* ── Floating Control Panel ───────────────────────────────── */
.inspire-rev-control-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 24px;
  background: var(--inspire-bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--inspire-border-glass);
  border-radius: 9999px;
  box-shadow: var(--inspire-shadow);
  color: var(--inspire-white);
  animation: inspire-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  user-select: none;
  pointer-events: auto;
  /* Never overflow a narrow viewport */
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  white-space: nowrap;
}

/* ── Mobile status badge (hidden on desktop) ─────────────── */
.inspire-rev-status-badge-mobile {
  display: none;
}

/* ── Mobile ≤ 540px ────────────────────────────────────────── */
@media (max-width: 540px) {
  .inspire-rev-control-bar {
    bottom: 16px;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 9999px; /* maintain premium floating pill shape */
    max-width: calc(100vw - 20px);
    width: auto;
  }

  /* IDC logo is too wide on phones — hide it to prioritize space */
  .inspire-rev-logo-group {
    display: none !important;
  }

  /* Hide the desktop status wrapper on mobile */
  .inspire-rev-status-wrapper {
    display: none !important;
  }

  /* Float the mobile status badge elegantly at the top center of the screen */
  .inspire-rev-status-badge-mobile {
    display: flex !important;
    align-items: center;
    gap: 8px;
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    background: var(--inspire-bg-glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--inspire-border-glass);
    border-radius: 9999px;
    padding: 6px 14px;
    box-shadow: var(--inspire-shadow);
  }

  /* Keep full text labels visible on all action buttons */
  .inspire-rev-btn-label {
    display: inline !important;
  }

  .inspire-rev-btn {
    font-size: 11px;
    padding: 6px 10px;
    gap: 4px;
    border-radius: 9999px;
    height: auto;
    width: auto;
  }

  /* The revisions button displays cleanly next to them */
  .inspire-rev-btn-revisions {
    padding: 6px 10px;
    gap: 4px;
  }

  .inspire-rev-actions {
    gap: 6px;
  }

  /* Ensure sidebar footer clears the bottom toolbar */
  .inspire-rev-sidebar-footer {
    padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
  }

  .inspire-rev-sidebar {
    padding-bottom: 0 !important;
  }
}

/* ── Wordmark treatments ──────────────────────────────────── */
.inspire-rev-logo-group {
  display: flex;
  flex-direction: column;
  line-height: 1;
  border-right: 1px solid rgba(255, 255, 255, 0.15);
  padding-right: 16px;
}

.inspire-rev-logo-text-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.inspire-rev-logo-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--inspire-white);
  display: inline-flex;
  gap: 3px;
}

.inspire-rev-logo-designs {
  color: var(--inspire-white);
}

.inspire-rev-logo-collective {
  font-size: 7px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--inspire-coral);
  margin-top: 2px;
}

/* ── Status wrapper ───────────────────────────────────────── */
.inspire-rev-status-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Status dot ───────────────────────────────────────────── */
.inspire-rev-status-dot {
  width: 8px;
  height: 8px;
  background-color: var(--inspire-coral);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--inspire-coral);
}

/* ── Actions row ──────────────────────────────────────────── */
.inspire-rev-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Glassmorphic buttons ─────────────────────────────────── */
.inspire-rev-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--inspire-light-gray);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  font-family: var(--inspire-font);
}

.inspire-rev-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--inspire-white);
}

.inspire-rev-btn-primary {
  background: var(--inspire-gradient);
  border-color: transparent;
  color: var(--inspire-white);
}

.inspire-rev-btn-primary:hover {
  opacity: 0.95;
  box-shadow: var(--inspire-shadow-accent);
  transform: translateY(-1px);
}

.inspire-rev-btn-primary.inspire-rev-active {
  background: linear-gradient(135deg, var(--inspire-pink) 0%, var(--inspire-coral) 100%);
  box-shadow: 0 0 15px rgba(255, 127, 80, 0.4);
}

.inspire-rev-btn-text {
  background: transparent;
  border: none;
  color: var(--inspire-slate-gray);
}

.inspire-rev-btn-text:hover {
  color: var(--inspire-white);
  background: rgba(255, 255, 255, 0.04);
}

/* ── Fullscreen Capture Overlay ───────────────────────────── */
.inspire-rev-capture-overlay {
  position: fixed;
  inset: 0;
  z-index: 999990;
  pointer-events: auto;
  cursor: crosshair;
  background: rgba(26, 26, 26, 0.15);
}

.inspire-rev-capture-indicator {
  position: absolute;
  padding: 8px 16px;
  background: var(--inspire-charcoal);
  border: 1px solid var(--inspire-violet);
  border-radius: 8px;
  color: var(--inspire-white);
  font-size: 12px;
  pointer-events: none;
  transform: translate(15px, 15px);
  box-shadow: var(--inspire-shadow);
  white-space: nowrap;
  font-weight: 500;
  font-family: var(--inspire-font);
}

.inspire-rev-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--inspire-violet);
  color: var(--inspire-white);
  font-size: 13px;
  font-weight: 700;
  border-radius: 50%;
  border: 2px solid var(--inspire-white);
  box-shadow: 0 4px 10px rgba(0,0,0,0.4);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.inspire-rev-pin:hover,
.inspire-rev-pin.inspire-rev-selected {
  background: var(--inspire-pink);
  transform: scale(1.15);
  box-shadow: 0 0 15px var(--inspire-pink);
}

.inspire-rev-pin-priority-high {
  background: var(--inspire-pink);
  border-color: var(--inspire-coral);
}

.inspire-rev-pin-priority-low {
  background: var(--inspire-slate-gray);
}

/* ── Pin Popover / Comment Form ───────────────────────────── */
.inspire-rev-popover {
  position: absolute;
  top: 36px;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  background: var(--inspire-bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--inspire-border-glass);
  border-radius: 12px;
  padding: 18px 16px 16px 16px;
  box-shadow: var(--inspire-shadow);
  color: var(--inspire-white);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: inspire-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  overflow: hidden;
}

/* 135deg top thin brand accent bar for popover */
.inspire-rev-popover::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--inspire-gradient);
}

.inspire-rev-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.inspire-rev-popover-title {
  color: var(--inspire-white);
}

.inspire-rev-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inspire-rev-form-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--inspire-slate-gray);
  letter-spacing: 0.05em;
}

.inspire-rev-input,
.inspire-rev-textarea,
.inspire-rev-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--inspire-white);
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  font-family: var(--inspire-font);
  box-sizing: border-box;
  transition: all 0.15s ease;
}

.inspire-rev-textarea {
  min-height: 70px;
  resize: vertical;
}

.inspire-rev-input:focus,
.inspire-rev-textarea:focus,
.inspire-rev-select:focus {
  border-color: var(--inspire-violet);
  background: rgba(255, 255, 255, 0.06);
}

.inspire-rev-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* ── Sidebar Drawer ───────────────────────────────────────── */
.inspire-rev-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  background: radial-gradient(circle at bottom right, rgba(255, 127, 80, 0.12) 0%, var(--inspire-charcoal) 60%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-left: 1px solid var(--inspire-border-glass);
  box-shadow: var(--inspire-shadow);
  z-index: 999997;
  display: flex;
  flex-direction: column;
  color: var(--inspire-white);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
  overflow: hidden;
}

/* Full-width on mobile */
@media (max-width: 540px) {
  .inspire-rev-sidebar {
    width: 100vw;
  }
}

/* Thin brand gradient bar on top of sidebar */
.inspire-rev-sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: var(--inspire-gradient);
  z-index: 2;
}

.inspire-rev-sidebar.inspire-rev-open {
  transform: translateX(0);
}

.inspire-rev-sidebar-header {
  padding: 24px 20px 20px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 1;
}

.inspire-rev-sidebar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.inspire-rev-sidebar-heading {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 0.02em;
}

.inspire-rev-sidebar-count {
  background: var(--inspire-violet);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--inspire-white);
}

.inspire-rev-close-btn {
  cursor: pointer;
  background: transparent;
  border: none;
  color: var(--inspire-slate-gray);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.2s;
}

.inspire-rev-close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--inspire-white);
}

.inspire-rev-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 1;
}

.inspire-rev-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  color: var(--inspire-slate-gray);
  gap: 8px;
}

.inspire-rev-empty-icon {
  width: 48px;
  height: 48px;
  color: rgba(255, 255, 255, 0.05);
}

/* ── Feedback Cards ───────────────────────────────────────── */
.inspire-rev-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s;
  cursor: pointer;
}

.inspire-rev-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.inspire-rev-selected-card {
  border-color: var(--inspire-violet);
  background: rgba(142, 84, 233, 0.08);
}

.inspire-rev-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.inspire-rev-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inspire-rev-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--inspire-violet);
  color: var(--inspire-white);
  font-size: 11px;
  font-weight: 700;
  border-radius: 50%;
}

.inspire-rev-card-page {
  font-size: 10px;
  color: var(--inspire-slate-gray);
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspire-rev-card-priority {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
}

.inspire-rev-prio-low {
  background: rgba(75, 85, 99, 0.15);
  color: var(--inspire-slate-gray);
}
.inspire-rev-prio-medium {
  background: rgba(47, 128, 237, 0.12);
  color: #72a5e8;
}
.inspire-rev-prio-high {
  background: rgba(227, 76, 137, 0.15);
  color: #e57ea9;
}

.inspire-rev-card-comment {
  font-size: 13px;
  color: var(--inspire-light-gray);
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.inspire-rev-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  padding-top: 8px;
  font-size: 11px;
  color: var(--inspire-slate-gray);
}

.inspire-rev-card-author {
  font-weight: 500;
}

.inspire-rev-card-actions {
  display: flex;
  gap: 8px;
}

.inspire-rev-card-btn {
  background: transparent;
  border: none;
  color: var(--inspire-slate-gray);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  transition: color 0.15s;
}

.inspire-rev-card-btn:hover {
  color: var(--inspire-white);
}

.inspire-rev-card-btn-danger:hover {
  color: var(--inspire-pink);
}

/* ── Sidebar footer ───────────────────────────────────────── */
.inspire-rev-sidebar-footer {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1;
}

/* ── Animations ───────────────────────────────────────────── */
@keyframes inspire-slide-up {
  from {
    transform: translate(-50%, 100px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}

@keyframes inspire-scale-in {
  from {
    transform: translateX(-50%) scale(0.92);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

/* ── Global pin overlay wrapper ───────────────────────────────
   IMPORTANT: position:fixed so pin percentages match the
   fixed capture overlay's coordinate space exactly.           */
.inspire-rev-global-overlay-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  overflow: visible;
  z-index: 999994;
}

/* Drag hint label that appears below a selected pin */
.inspire-rev-drag-hint {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--inspire-slate-gray);
  white-space: nowrap;
  pointer-events: none;
  animation: inspire-fade-in 0.2s ease;
}

/* Dragging state — show grabbing cursor, lift the pin slightly */
.inspire-rev-pin-dragging {
  cursor: grabbing !important;
  transform: scale(1.25);
  box-shadow: 0 0 20px var(--inspire-violet);
  z-index: 999998;
}

@keyframes inspire-fade-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```
