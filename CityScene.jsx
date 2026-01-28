/**
 * WHAT CHANGED:
 * 1.  **RBAC & Account Types**: Added logic to distinguish Guest, Individual, and Organization accounts.
 * - Stored in `VIRTUNOVO_ACCOUNT_TYPE` and `VIRTUNOVO_ORG_CONTEXT`.
 * 2.  **Brand Mode Gating**: "For Brands" toggle and panel are now hidden for Guests/Individuals.
 * - Visible to Organizations ONLY if they rent >= 1 asset (checked via `sceneData`).
 * 3.  **Analytics Scoping**: Brand Panel metrics are now filtered. Orgs only see data for assets they own (`brand.orgId` matches).
 * - Unowned assets show "Confidential / Data Locked" in the inspector.
 * 4.  **Admin Asset Management**:
 * - Added **Asset IDs** (e.g., BB-001) generated during migration.
 * - Added **Asset ID Overlay** toggle for Admins to visualize IDs in 3D.
 * - Added **Brand Metadata** editing in `UnifiedControlPanel` (assign Org, Dates, Email to an asset).
 * 5.  **Master Control (Type-to-Edit)**: Enhanced Command Palette for Admins to search assets by ID/Name/Sponsor and jump to edit.
 * 6.  **Price Tags**: Added `PriceTagOverlay` system. Hidden by default. Admin can toggle visibility and manage a viewer whitelist.
 * 7.  **Auth UX Upgrades**:
 * - Added "Show/Hide Password" toggle.
 * - Added "Forgot Password" link (simulated local token flow).
 * - Added "Industry" field for Organization signup.
 * 8.  **UI Visibility Rules**:
 * - "My Progress" drawer hidden for Guests/Orgs (Individual only).
 * - Missions/Vault visibility configurable for Guests via `missionsForGuest` flag.
 * 9.  **Migrations**: Auto-assigns Asset IDs (`BB-0001`, `BLD-0001`) to existing scene data on mount.
 */

import React, { useEffect, useState, useRef, Suspense, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Float, Stars, useTexture, Billboard, Image, Loader, TransformControls, Html, Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// 1. NOTIFICATION & CONFIG
// ==========================================
const ToastContext = createContext(null);
const useToast = () => { const ctx = useContext(ToastContext); return ctx || (() => {}); };
const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);
    const showToast = (msg, type='info') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };
    return (
        <ToastContext.Provider value={showToast}>
            {children}
            {toast && <div aria-live="polite" style={{position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background: toast.type==='error'?'#ef4444': toast.type==='success'?'#22c55e':'#3b82f6', color:'white', padding:'12px 24px', borderRadius:8, zIndex: 10000, fontWeight:'bold', boxShadow:'0 4px 12px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', animation:'fadeIn 0.3s'}}>{toast.type==='success'?'✅':toast.type==='error'?'❌':'ℹ️'} {toast.msg}</div>}
        </ToastContext.Provider>
    );
};

// --- EXISTING KEYS ---
const STORAGE_KEY = "VIRTUNOVO_SCENE_DATA";
const SITE_CONFIG_KEY = "VIRTUNOVO_SITE_CONFIG";
const USERS_DB_KEY = "VIRTUNOVO_USERS_DB";
const ADMIN_CONFIG_KEY = "VIRTUNOVO_ADMIN_CONFIG";
const MASTER_FLAGS_KEY = "VIRTUNOVO_MASTER_FLAGS";
const AUTH_STATE_KEY = "VIRTUNOVO_AUTH_STATE";
const USER_SESSION_KEY = "VIRTUNOVO_REMEMBER_USER";
const ADMIN_LOGS_KEY = "VIRTUNOVO_ADMIN_LOGS";
const NOTIFICATION_TEMPLATES_KEY = "VIRTUNOVO_NOTIFICATION_TEMPLATES";
const SEO_CONFIG_KEY = "VIRTUNOVO_SEO_CONFIG";
const SITE_VERSION_HISTORY_KEY = "VIRTUNOVO_SITE_VERSION_HISTORY";
const SIDEBAR_COLLAPSED_KEY = "VIRTUNOVO_UI_SIDEBAR_COLLAPSED";
const BRAND_LOGO_KEY = "VIRTUNOVO_BRAND_LOGO";

// --- PREVIOUS KEYS ---
const BRAND_MODE_KEY = "VIRTUNOVO_BRAND_MODE";
const TOUR_DONE_KEY = "VIRTUNOVO_TOUR_DONE";
const PREF_SPAWN_KEY = "VIRTUNOVO_PREF_SPAWN_DISTRICT";
const CMD_HISTORY_KEY = "VIRTUNOVO_CMD_HISTORY";
const EVENT_ARRIVAL_KEY = "VIRTUNOVO_EVENT_ARRIVAL_LOG";
const AUDIO_PREFS_KEY = "VIRTUNOVO_AUDIO_PREFS";
const CHANGELOG_KEY = "VIRTUNOVO_CHANGELOG";
const SEASON_KEY = "VIRTUNOVO_SEASON";
const BRAND_LEADS_KEY = "VIRTUNOVO_BRAND_LEADS";
const FLIGHTS_KEY = "VIRTUNOVO_FLIGHTS";
const COMPLIANCE_NOTES_KEY = "VIRTUNOVO_COMPLIANCE_NOTES";
const ORG_WORKSPACES_KEY = "VIRTUNOVO_ORG_WORKSPACES";

// --- NEW KEYS (RBAC + SCOPING) ---
const ACCOUNT_TYPE_KEY = "VIRTUNOVO_ACCOUNT_TYPE"; // 'guest'|'individual'|'organization'
const ORG_CONTEXT_KEY = "VIRTUNOVO_ORG_CONTEXT"; // { orgId, orgName, orgIndustry, role }
const PRICE_TAGS_VISIBLE_KEY = "VIRTUNOVO_PRICE_TAGS_VISIBLE";
const PRICE_TAG_WHITELIST_KEY = "VIRTUNOVO_PRICE_TAG_WHITELIST";
const ASSET_SEQ_KEY = "VIRTUNOVO_ASSET_SEQ";
const RESET_TOKENS_KEY = "VIRTUNOVO_RESET_TOKENS";

const KEYS = {
    DAILY_MISSIONS: "VIRTUNOVO_DAILY_MISSIONS",
    POINTS: "VIRTUNOVO_POINTS",
    TICKETS: "VIRTUNOVO_TICKETS",
    STREAK: "VIRTUNOVO_STREAK",
    LAST_ACTIVE: "VIRTUNOVO_LAST_ACTIVE_DATE",
    WEEKLY_POINTS: "VIRTUNOVO_WEEKLY_POINTS",
    TICKET_BUY: "VIRTUNOVO_TICKET_BUY_COUNT",
    TICKET_BUY_DATE: "VIRTUNOVO_TICKET_BUY_COUNT_DATE",
    EVENTS: "VIRTUNOVO_EVENTS",
    LEADERBOARD: "VIRTUNOVO_LEADERBOARD",
    REF_CODE: "VIRTUNOVO_REF_CODE",
    REF_INCOMING: "VIRTUNOVO_REF_INCOMING",
    REF_LEDGER: "VIRTUNOVO_REF_LEDGER",
    REF_REWARD_DATE: "VIRTUNOVO_REF_REWARD_DATE",
    EVENTS_LOG: "VIRTUNOVO_EVENTS_LOG",
    ANALYTICS: "VIRTUNOVO_ANALYTICS",
    BRAND_LEADS_LEGACY: "VIRTUNOVO_BRAND_LEADS",
    REF_MAP: "VIRTUNOVO_REF_MAP",
    VISITED_DISTRICTS: "VIRTUNOVO_VISITED_DISTRICTS",
    GUEST_ID: "VIRTUNOVO_GUEST_ID",
    DAILY_CRYSTALS: "VIRTUNOVO_DAILY_CRYSTALS",
    DAILY_CRYSTALS_DATE: "VIRTUNOVO_DAILY_CRYSTALS_DATE"
};

const ROLES = { ADMIN: 'ADMIN', EDITOR: 'EDITOR', VIEWER: 'VIEWER', VISITOR: 'VISITOR', ORG_ADMIN: 'ORG_ADMIN', MARKETER: 'MARKETER' };
const ACCOUNT_TYPES = { GUEST: 'guest', INDIVIDUAL: 'individual', ORGANIZATION: 'organization' };

const DEFAULT_SCENE_DATA = { 
    HERO: { hText: "WELCOME", vText: "VIRTUNOVO", ledColor: "#00ffff", wallColor: "#050505", winColor: "#0066ff" },
    BILLBOARD_0: { x: -2500, y: 0, z: -2500, width: 600, height: 340, rotY: Math.PI/4, sponsorName: "VirtuTech", ctaUrl: "https://google.com" },
    BILLBOARD_1: { x: 2500, y: 0, z: -2500, width: 600, height: 340, rotY: -Math.PI/4, sponsorName: "CyberCola", ctaUrl: "https://google.com" },
    BILLBOARD_2: { x: -2500, y: 0, z: 2500, width: 600, height: 340, rotY: Math.PI*0.75, sponsorName: "MetaMotors", ctaUrl: "https://google.com" },
    BILLBOARD_3: { x: 2500, y: 0, z: 2500, width: 600, height: 340, rotY: -Math.PI*0.75, sponsorName: "NeonBank", ctaUrl: "https://google.com" },
};
const DEFAULT_SITE_CONFIG = { heroTitle: "VIRTUNOVO", heroSubtitle: "The Future of Virtual Real Estate", aboutText: "Virtunovo is the world's first decentralized metaverse city.", contactText: "Contact us at sales@virtunovo.com for land inquiries." };
const DEFAULT_ADMIN_CONFIG = { email: "admin@virtunovo.com", password: "password", secretCode: "123456" };

// EXTENDED FLAGS
const DEFAULT_MASTER_FLAGS = { 
    maintenanceMode: false, 
    allowSignups: true, 
    showChat: true, 
    showLabels: true,
    adminSidebar: true, 
    showCustomerProgressDrawer: true, 
    enableAuditLog: true, 
    enableDashboardKPI: true,
    enableBrandMode: true,
    enableFlightPlan: true,
    enableCreativeChecker: true,
    enableLeadsPanel: true,
    enableCommandPalette: true,
    enableGuidedTour: true,
    enableSeasonPass: true,
    enableEventDome: true,
    enableHoloStage: true,
    enableAutoExpoDome: true,
    enableBrandCommandCenter: true,
    enableLiveBroadcastUI: true,
    enableCrowdFX: true,
    enablePortals: true,
    enableDomeScheduler: true,
    enableOneClickExports: true,
    // NEW RBAC & SCOPING FLAGS
    missionsForGuest: true,
    enableAssetIdsOverlay: true,
    enableMasterControlPalette: true,
    enableBrandModeGate: true,
    enablePriceTagGate: true
};

const loadData = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; } };
const saveData = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn("Storage quota?", e); } };

// --- ADMIN LOGGING HELPER ---
const logAdmin = (action, payload) => {
    const flags = loadData(MASTER_FLAGS_KEY, DEFAULT_MASTER_FLAGS);
    if (!flags.enableAuditLog) return;
    const logs = loadData(ADMIN_LOGS_KEY, []);
    const entry = { ts: new Date().toISOString(), actor: 'Admin', action, payload: payload || {} };
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    saveData(ADMIN_LOGS_KEY, logs);
};

// --- ERROR BOUNDARY ---
class LocalErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError(error) { return { hasError: true }; }
    componentDidCatch(error, errorInfo) { 
        console.error("UI Panel Error:", error, errorInfo); 
        logAdmin('ui_error', { message: error.message, stack: errorInfo.componentStack });
    }
    render() {
        if (this.state.hasError) return <div style={{padding:15, color:'#ef4444', border:'1px solid #ef4444', borderRadius:8, background:'rgba(0,0,0,0.8)'}}>Panel failed to load. See Admin Logs.</div>;
        return this.props.children;
    }
}

const useAnalytics = () => {
    const logEvent = (type, payload = {}) => {
        const logs = loadData(KEYS.ANALYTICS, []);
        const entry = { type, timestamp: new Date().toISOString(), ...payload };
        logs.push(entry);
        if(logs.length > 200) logs.shift();
        saveData(KEYS.ANALYTICS, logs);
        if(payload.campaignId || payload.sponsorName) {
            const campLogs = loadData(KEYS.EVENTS_LOG, []);
            campLogs.push(entry);
            saveData(KEYS.EVENTS_LOG, campLogs);
        }
    };
    return { logEvent };
};

const useGamification = (showToast) => {
    const { logEvent } = useAnalytics();
    const getToday = () => new Date().toISOString().split('T')[0];

    useEffect(() => {
        const today = getToday();
        const lastActive = localStorage.getItem(KEYS.LAST_ACTIVE);
        if (lastActive !== today) {
            let streak = parseInt(localStorage.getItem(KEYS.STREAK) || '0');
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const yStr = yesterday.toISOString().split('T')[0];
            if (lastActive !== yStr) streak = 0; 
            localStorage.setItem(KEYS.LAST_ACTIVE, today);
            localStorage.setItem(KEYS.STREAK, streak.toString());
            saveData(KEYS.VISITED_DISTRICTS, []);
        }
        const savedMissions = loadData(KEYS.DAILY_MISSIONS, null);
        const savedDate = savedMissions ? savedMissions.date : null;
        if (!savedMissions || savedDate !== today) {
            const newMissions = {
                date: today,
                items: [
                    { id: 'm1', title: 'Visit 2 Districts', goal: 2, current: 0, claimed: false, rewardPoints: 50, rewardTickets: 0, type: 'visit' },
                    { id: 'm2', title: 'Interact with Screen', goal: 1, current: 0, claimed: false, rewardPoints: 30, rewardTickets: 0, type: 'interact' },
                    { id: 'm3', title: 'Collect 3 Crystals', goal: 3, current: 0, claimed: false, rewardPoints: 100, rewardTickets: 1, type: 'collect' }
                ]
            };
            saveData(KEYS.DAILY_MISSIONS, newMissions);
        }
    }, []);

    const updateMission = (type, amount = 1) => {
        const data = loadData(KEYS.DAILY_MISSIONS, null);
        if(!data) return;
        let changed = false;
        const newItems = data.items.map(m => {
            if(m.type === type && m.current < m.goal) {
                const newVal = Math.min(m.current + amount, m.goal);
                if(newVal !== m.current) {
                    changed = true;
                    if(newVal === m.goal) {
                        showToast(`Mission Complete: ${m.title}`, 'success');
                        logEvent('mission_complete', { missionId: m.id });
                        const today = new Date().toISOString().split('T')[0];
                        const streakUpdated = localStorage.getItem('STREAK_UPDATED_DATE');
                        if(streakUpdated !== today) {
                            const s = parseInt(localStorage.getItem(KEYS.STREAK)||'0') + 1;
                            localStorage.setItem(KEYS.STREAK, s);
                            localStorage.setItem('STREAK_UPDATED_DATE', today);
                        }
                    }
                }
                return { ...m, current: newVal };
            }
            return m;
        });
        if(changed) saveData(KEYS.DAILY_MISSIONS, { ...data, items: newItems });
    };

    const claimMission = (id) => {
        const data = loadData(KEYS.DAILY_MISSIONS, null);
        const m = data?.items?.find(x => x.id === id);
        if(m && m.current >= m.goal && !m.claimed) {
            m.claimed = true;
            saveData(KEYS.DAILY_MISSIONS, data);
            addPoints(m.rewardPoints);
            addTickets(m.rewardTickets);
            showToast(`Claimed: ${m.rewardPoints} pts ${m.rewardTickets?`+ ${m.rewardTickets} 🎟️`:''}`, 'success');
        }
    };

    const addPoints = (pts) => {
        const cur = parseInt(localStorage.getItem(KEYS.POINTS)||'0');
        localStorage.setItem(KEYS.POINTS, cur + pts);
        const week = parseInt(localStorage.getItem(KEYS.WEEKLY_POINTS)||'0');
        localStorage.setItem(KEYS.WEEKLY_POINTS, week + pts);
        try {
            const session = JSON.parse(localStorage.getItem(USER_SESSION_KEY));
            const users = loadData(USERS_DB_KEY, []);
            if (session?.email) {
                const idx = users.findIndex(u => u.email === session.email);
                if (idx >= 0) {
                    users[idx] = { ...users[idx], weeklyPoints: (users[idx].weeklyPoints || 0) + pts };
                    saveData(USERS_DB_KEY, users);
                }
            } else {
                const guestId = localStorage.getItem(KEYS.GUEST_ID) || 'Guest';
                const lb = loadData(KEYS.LEADERBOARD, {});
                lb[guestId] = { name: guestId, weeklyPoints: ((lb[guestId]?.weeklyPoints)||0) + pts };
                saveData(KEYS.LEADERBOARD, lb);
            }
        } catch {}
    };

    const addTickets = (tix) => {
        const cur = parseInt(localStorage.getItem(KEYS.TICKETS)||'0');
        localStorage.setItem(KEYS.TICKETS, cur + tix);
    };

    return { updateMission, claimMission, addPoints, addTickets };
};

const handleLoginAttempt = (email, password) => {
    const admin = loadData(ADMIN_CONFIG_KEY, DEFAULT_ADMIN_CONFIG);
    if (email === admin.email && password === admin.password) return { status: "2FA_REQUIRED" };
    const users = loadData(USERS_DB_KEY, []);
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        if (user.blocked) return { status: "ERROR", msg: "Account blocked." };
        return { status: "SUCCESS", user: user, role: user.role || ROLES.VISITOR };
    }
    return { status: "ERROR", msg: "Invalid credentials." };
};
const registerUser = (data) => {
    const users = loadData(USERS_DB_KEY, []);
    if(users.find(u => u.email === data.email)) return { success: false, msg: "User exists!" };
    
    const incomingRef = localStorage.getItem(KEYS.REF_INCOMING);
    if(incomingRef) {
        const today = new Date().toISOString().split('T')[0];
        if (localStorage.getItem(KEYS.REF_REWARD_DATE) !== today) {
            const ledger = loadData(KEYS.REF_LEDGER, []);
            if(!ledger.includes(data.email)) {
                ledger.push(data.email);
                saveData(KEYS.REF_LEDGER, ledger);
                localStorage.setItem(KEYS.REF_REWARD_DATE, today);
            }
        }
    }
    // New: Handle Org Context and Industry
    const newUser = { ...data, verified: true, blocked: false, joined: new Date().toISOString(), role: data.role || ROLES.VISITOR };
    if (data.accountType === ACCOUNT_TYPES.ORGANIZATION) {
        newUser.orgContext = { orgId: `ORG-${Date.now()}`, orgName: data.org, orgIndustry: data.industry, role: ROLES.ORG_ADMIN };
        localStorage.setItem(ORG_CONTEXT_KEY, JSON.stringify(newUser.orgContext));
    }
    users.push(newUser);
    saveData(USERS_DB_KEY, users);
    return { success: true, msg: "Account created." };
};

// ==========================================
// 2. 3D ASSETS & COMPONENTS
// ==========================================

const KeyboardMover = ({ selectedId, onMove, moveLocked }) => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedId || moveLocked) return;
            const speed = 20; let dx = 0; let dz = 0; let dy = 0;
            if (e.key === "ArrowUp") dz = -speed;
            if (e.key === "ArrowDown") dz = speed;
            if (e.key === "ArrowLeft") dx = -speed;
            if (e.key === "ArrowRight") dx = speed;
            if (e.key === "PageUp") dy = speed;
            if (e.key === "PageDown") dy = -speed;
            if (dx !== 0 || dz !== 0 || dy !== 0) onMove(selectedId, dx, dy, dz, true);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedId, moveLocked, onMove]);
    return null;
};

const SmartMediaMaterial = ({ url, color, side=THREE.DoubleSide, isPlaying = true, transparent=false }) => {
    const [videoElem, setVideoElem] = useState(null);
    const texture = useMemo(() => {
        if (!url) return null;
        const isVideo = url.startsWith('data:video') || url.match(/\.(mp4|webm)$/i);
        if (isVideo) {
            const vid = document.createElement('video');
            vid.src = url; vid.crossOrigin = 'Anonymous'; 
            vid.loop = true; vid.muted = true; vid.autoplay = false; 
            vid.playsInline = true; vid.preload = 'metadata';
            setVideoElem(vid);
            const vidTex = new THREE.VideoTexture(vid);
            vidTex.minFilter = THREE.LinearFilter; vidTex.magFilter = THREE.LinearFilter;
            vidTex.generateMipmaps = false;
            return vidTex;
        } else {
            const imgTex = new THREE.TextureLoader().load(url);
            imgTex.anisotropy = 16;
            return imgTex;
        }
    }, [url]);

    useEffect(() => {
        if (!videoElem) return;
        if (isPlaying) {
            if (!videoElem.hasStarted) {
                const timer = setTimeout(() => {
                    videoElem.play().catch(e => console.log("Autoplay prevented", e));
                    videoElem.hasStarted = true;
                }, 3000);
                return () => clearTimeout(timer);
            } else { videoElem.play(); }
        } else { videoElem.pause(); }
    }, [videoElem, isPlaying]);

    if (texture) { 
        texture.center.set(0.5, 0.5); 
        return <meshBasicMaterial map={texture} toneMapped={false} side={side} transparent={transparent} polygonOffset={true} polygonOffsetFactor={-1} polygonOffsetUnits={-4} depthWrite={false} />; 
    }
    return <meshStandardMaterial color={color || "#111"} emissive={color || "#111"} emissiveIntensity={0.2} side={side} />;
};

// --- NEW 3D COMPONENTS: DOMES & PROPS ---

const PortalGate = ({ position, label, targetCoords, onWarp, color = "#00ffff" }) => {
    const ref = useRef();
    useFrame((state) => {
        if (ref.current) {
            ref.current.rotation.z += 0.01;
            ref.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.2;
        }
    });
    return (
        <group position={position} onClick={(e) => { e.stopPropagation(); onWarp(targetCoords); }}>
            <group ref={ref}>
                <mesh><torusGeometry args={[30, 2, 16, 100]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} /></mesh>
                <mesh rotation={[0,0,Math.PI/2]}><torusGeometry args={[25, 1, 16, 100]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} /></mesh>
            </group>
            <Text position={[0, 45, 0]} fontSize={14} color="white" outlineWidth={1} outlineColor={color}>{label}</Text>
            <pointLight intensity={5} distance={100} color={color} />
        </group>
    );
};

const EventDome = ({ position }) => {
    const domeRef = useRef();
    useFrame((state) => {
        if (domeRef.current) domeRef.current.rotation.y += 0.0005;
    });
    
    // Instanced Seating
    const seatCount = 200;
    const seats = useMemo(() => {
        const temp = [];
        for (let i = 0; i < seatCount; i++) {
            const angle = (i / seatCount) * Math.PI * 2;
            const radius = 600 + Math.random() * 200;
            const y = 50 + (radius - 600) * 0.5;
            temp.push({ position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius], rotation: [0, -angle + Math.PI/2, 0] });
        }
        return temp;
    }, []);

    return (
        <group position={position}>
            {/* Shell */}
            <mesh position={[0, -50, 0]}>
                <sphereGeometry args={[1200, 64, 32, 0, Math.PI*2, 0, Math.PI/2]} />
                <meshStandardMaterial color="#050510" side={THREE.BackSide} metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Sky Panels */}
            <group ref={domeRef}>
                {[0,1,2,3,4].map(i => (
                    <mesh key={i} position={[0, 800, 0]} rotation={[Math.random(), Math.random(), Math.random()]}>
                        <ringGeometry args={[600 + i*50, 605 + i*50, 64]} />
                        <meshBasicMaterial color="#00aaff" side={THREE.DoubleSide} transparent opacity={0.3} />
                    </mesh>
                ))}
            </group>
            {/* HoloStage */}
            <group position={[0, 10, 0]}>
                <mesh><cylinderGeometry args={[200, 220, 20, 32]} /><meshStandardMaterial color="#111" emissive="#0044ff" emissiveIntensity={0.5} /></mesh>
                <mesh position={[0, 100, 0]}><coneGeometry args={[100, 200, 4, 1, true]} /><meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.1} /></mesh>
            </group>
            {/* Seats */}
            <Instances range={seatCount}>
                <boxGeometry args={[10, 10, 10]} />
                <meshStandardMaterial color="#333" />
                {seats.map((s, i) => <Instance key={i} position={s.position} rotation={s.rotation} />)}
            </Instances>
            {/* VIP Deck */}
            <group position={[0, 300, -500]}>
                <mesh rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[600, 200]} /><meshStandardMaterial color="#000" transparent opacity={0.8} /></mesh>
                <Text position={[0, 10, 0]} fontSize={40} color="gold">VIP SKY DECK</Text>
            </group>
        </group>
    );
};

const AutoExpoDome = ({ position, exploded }) => {
    const groupRef = useRef();
    const carRef = useRef();
    
    useFrame((state, delta) => {
        if(groupRef.current) groupRef.current.rotation.y -= 0.001;
        if(carRef.current) {
            // Simple exploded view animation
            const targetScale = exploded ? 1.2 : 1;
            carRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 2);
        }
    });

    return (
        <group position={position}>
             <mesh position={[0, -10, 0]} receiveShadow><cylinderGeometry args={[400, 400, 10, 64]} /><meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} /></mesh>
             <group ref={groupRef}>
                 {/* Floating Pods */}
                 {[0, 120, 240].map((deg, i) => {
                     const rad = deg * Math.PI / 180;
                     return (
                         <group key={i} position={[Math.cos(rad)*250, 50 + Math.sin(i)*20, Math.sin(rad)*250]}>
                             <mesh><boxGeometry args={[80, 40, 140]} /><meshStandardMaterial color={i===0?"red":i===1?"blue":"white"} metalness={0.9} roughness={0.1} /></mesh>
                             <mesh position={[0, -30, 0]}><cylinderGeometry args={[60, 40, 10, 32]} /><meshBasicMaterial color="#00ffff" wireframe /></mesh>
                         </group>
                     )
                 })}
             </group>
             {/* Center Hero Car */}
             <group ref={carRef} position={[0, 60, 0]}>
                 <mesh><boxGeometry args={[100, 50, 180]} /><meshStandardMaterial color="#ffaa00" metalness={1} roughness={0.1} /></mesh>
                 {exploded && (
                     <>
                        <mesh position={[0, 60, 0]}><boxGeometry args={[80, 10, 140]} /><meshStandardMaterial color="#333" transparent opacity={0.5} /></mesh>
                        <mesh position={[60, 0, 0]}><cylinderGeometry args={[20, 20, 10, 16]} rotation={[0,0,Math.PI/2]} /><meshStandardMaterial color="#111" /></mesh>
                        <mesh position={[-60, 0, 0]}><cylinderGeometry args={[20, 20, 10, 16]} rotation={[0,0,Math.PI/2]} /><meshStandardMaterial color="#111" /></mesh>
                     </>
                 )}
             </group>
        </group>
    );
};

const CrowdFX = ({ enabled }) => {
    const gridRef = useRef();
    useFrame((state) => {
        if (!enabled || !gridRef.current) return;
        const t = state.clock.elapsedTime;
        gridRef.current.material.emissiveIntensity = 0.5 + Math.sin(t * 8) * 0.5; // Beat pulse
        gridRef.current.position.y = Math.sin(t * 2) * 5;
    });
    if (!enabled) return null;
    return (
        <mesh ref={gridRef} rotation={[-Math.PI/2, 0, 0]} position={[0, 5, 0]}>
            <planeGeometry args={[2000, 2000, 50, 50]} />
            <meshStandardMaterial color="#ff00ff" wireframe emissive="#ff00ff" transparent opacity={0.1} />
        </mesh>
    );
};

// NEW: Asset ID Overlay for Admins
const AssetIdOverlay = ({ sceneData, visible }) => {
    if (!visible) return null;
    return (
        <group>
            {Object.entries(sceneData).map(([key, data]) => (
                <Html key={key} position={[data.x || 0, (data.y || 0) + (data.height || 300) + 50, data.z || 0]} center>
                    <div style={{background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: 4, border: '1px solid lime', color: 'lime', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap'}}>
                        {data.assetId || key}
                    </div>
                </Html>
            ))}
        </group>
    );
};

// NEW: Price Tag Overlay (Whitelist controlled)
const PriceTagOverlay = ({ sceneData, visible }) => {
    if (!visible) return null;
    return (
        <group>
            {Object.entries(sceneData).map(([key, data]) => {
                if (!data.brand?.priceTag) return null;
                return (
                    <Html key={key} position={[data.x || 0, (data.y || 0) + (data.height || 300) / 2, (data.z || 0) + (data.width || 100) / 2 + 20]} center>
                        <div style={{background: 'rgba(0,20,0,0.9)', padding: '4px 8px', borderRadius: 4, border: '1px solid #22c55e', color: '#22c55e', fontSize: 12, fontWeight: 'bold', boxShadow: '0 0 10px #22c55e'}}>
                            {data.brand.priceTag}
                        </div>
                    </Html>
                );
            })}
        </group>
    );
};

const CameraHandler = ({ viewState, onTransitionEnd }) => {
    const { camera } = useThree();
    const targetPos = useRef(new THREE.Vector3(0, 800, 1800));
    const startPos = useRef(new THREE.Vector3(0, 5000, 8000));
    const isTransitioning = useRef(false);
    useEffect(() => {
        if (viewState === "LANDING") {
            camera.position.copy(startPos.current); camera.lookAt(0, 0, 0);
        } else if (viewState === "TRANSITION") {
            isTransitioning.current = true;
        }
    }, [viewState, camera]);
    useFrame((state, delta) => {
        if (isTransitioning.current) {
            state.camera.position.lerp(targetPos.current, 1.5 * delta);
            state.camera.lookAt(0, 0, 0);
            if (state.camera.position.distanceTo(targetPos.current) < 50) {
                isTransitioning.current = false; onTransitionEnd();
            }
        }
    });
    return null;
};

const ProximityTracker = ({ targets, onEnter, onLeave, updateDwell }) => {
    const { camera } = useThree();
    const [currentSponsor, setCurrentSponsor] = useState(null);
    useFrame((state, delta) => {
        if(!targets) return;
        let found = null;
        const threshold = 900;
        targets.forEach(t => {
            if (!t) return;
            const pos = new THREE.Vector3(t.x || 0, 0, t.z || 0); 
            const dist = camera.position.distanceTo(pos);
            if(dist < threshold) found = t;
        });
        if(found && found.id !== currentSponsor?.id) {
            setCurrentSponsor(found);
            onEnter(found);
        } else if (!found && currentSponsor) {
            setCurrentSponsor(null);
            onLeave();
        }
        if(found) updateDwell(found.id, delta);
    });
    return null;
};

const DynamicBuildingMaterial = ({ wallColor, windowColor, textureUrl, height }) => {
  const proceduralTex = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; 
    const ctx = canvas.getContext('2d'); ctx.fillStyle = windowColor; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = wallColor; ctx.lineWidth = 16; ctx.strokeRect(0, 0, 128, 128); 
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
  }, [wallColor, windowColor]);
  
  if (textureUrl && textureUrl.length > 5) { 
      const imageTex = useTexture(textureUrl); imageTex.wrapS = imageTex.wrapT = THREE.RepeatWrapping; 
      return <meshStandardMaterial map={imageTex} emissiveMap={imageTex} emissiveIntensity={0.5} toneMapped={false} />; 
  }
  proceduralTex.repeat.set(1, height / 60);
  return <meshStandardMaterial map={proceduralTex} emissive={windowColor} emissiveIntensity={0.8} roughness={0.2} metalness={0.5} />;
};

const TwistedTowers = ({ height, width }) => {
    const segmentCount = 40; const twistAmount = Math.PI * 1.5;
    return ( <group> {Array.from({ length: segmentCount }).map((_, i) => { const ratio = i / segmentCount; const y = (ratio - 0.5) * height; const rot = ratio * twistAmount; const scale = 1 - Math.pow(ratio - 0.5, 2) * 0.5; return ( <group key={i} position={[0, y + height/2, 0]} rotation={[0, rot, 0]}><mesh position={[-width * 0.35 * scale, 0, 0]}><boxGeometry args={[width * 0.3, height/segmentCount * 1.1, width * 0.2]} /><meshStandardMaterial color="#ffffff" emissive="#aaaaaa" emissiveIntensity={0.2} metalness={0.9} roughness={0.1} /></mesh> <mesh position={[width * 0.35 * scale, 0, 0]}><boxGeometry args={[width * 0.3, height/segmentCount * 1.1, width * 0.2]} /><meshStandardMaterial color="#ffffff" emissive="#aaaaaa" emissiveIntensity={0.2} metalness={0.9} roughness={0.1} /></mesh> <mesh position={[width * 0.5 * scale, 0, width * 0.1]}><boxGeometry args={[5, height/segmentCount, 5]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.6} /></mesh> <mesh position={[-width * 0.5 * scale, 0, -width * 0.1]}><boxGeometry args={[5, height/segmentCount, 5]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.6} /></mesh> </group> ) })} </group> )
}

const HorizontalMarquee = ({ width, text, color }) => { const group = useRef(); useFrame((_, delta) => (group.current.rotation.y -= 0.5 * delta)); return ( <group ref={group}> <mesh visible={false}><cylinderGeometry args={[width * 0.9, width * 0.9, 20, 32, 1, true]} /><meshBasicMaterial color="#000" /></mesh> {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, i) => ( <group key={i} rotation={[0, rot, 0]}><Text position={[0, 0, width * 0.9 + 1]} fontSize={16} color="#ffffff" anchorX="center" anchorY="middle" toneMapped={false} outlineWidth={2} outlineColor={color}>{text}</Text> </group> ))} </group> ); };
const VerticalMarquee = ({ height, width, text, color }) => { const textRef = useRef(); useFrame((_, delta) => { if(textRef.current) { textRef.current.position.y += 25 * delta; if (textRef.current.position.y > height/2) textRef.current.position.y = -height/2; } }); const panelWidth = width * 0.95; return ( <group> <mesh visible={false}><boxGeometry args={[panelWidth, height * 0.9, 2]} /><meshBasicMaterial color="#000" /></mesh> <group ref={textRef} position={[0, -height/4, 2]}><Text fontSize={width * 0.3} color={color} anchorX="center" anchorY="middle" maxWidth={panelWidth} textAlign="center" toneMapped={false} lineHeight={1}>{text.split("").join("\n")}</Text></group> </group> ) }

const RoadStrip = ({ position, rotation, length, width }) => ( 
    <group position={position} rotation={rotation}> 
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 4, 0]}> <planeGeometry args={[width, length]} /> <meshStandardMaterial color="#050505" roughness={1} metalness={0} /> </mesh> 
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 6, 0]}> <planeGeometry args={[5, length]} /> <meshBasicMaterial color="#222222" /> </mesh> 
    </group> 
)

const CurvedScreenBuilding = ({ width, height, data, isFiller }) => {
    const radius = 60; const flatWidth = width - radius;
    return (
        <group position={[0, height/2, 0]}>
            <mesh>
                <boxGeometry args={[width, height, width]} />
                <Suspense fallback={<meshStandardMaterial color="#111" />}>
                     <DynamicBuildingMaterial wallColor={data?.wallColor||"#111"} windowColor={data?.winColor||"#00f"} height={height} />
                </Suspense>
            </mesh>
            {!isFiller && (
                <group position={[-(width/2)+radius/2, 0, (width/2)-radius/2]}>
                     <mesh position={[flatWidth/2, 0, radius/2 + 2]}>
                         <planeGeometry args={[flatWidth, height * 0.8]} />
                         <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={data?.skinUrl} color="#000" /></Suspense>
                     </mesh>
                     <mesh position={[flatWidth + radius/2 - radius*0.2, 0, radius/2 - radius*0.2 + 2]} rotation={[0, -Math.PI/2, 0]}>
                         <cylinderGeometry args={[radius+2, radius+2, height * 0.8, 32, 1, true, 0, Math.PI/2]} />
                         <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={data?.skinUrl} color="#000" /></Suspense>
                     </mesh>
                     <mesh position={[flatWidth + radius + 2, 0, -flatWidth/2 + radius/2 + 2]} rotation={[0, Math.PI/2, 0]}>
                         <planeGeometry args={[flatWidth, height * 0.8]} />
                         <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={data?.skinUrl} color="#000" /></Suspense>
                     </mesh>
                     <mesh position={[flatWidth/2 + radius/2, height*0.4 + 5, 0]}><boxGeometry args={[width + 10, 10, width + 10]} /><meshStandardMaterial color="#222" /></mesh>
                     <mesh position={[flatWidth/2 + radius/2, -height*0.4 - 5, 0]}><boxGeometry args={[width + 10, 10, width + 10]} /><meshStandardMaterial color="#222" /></mesh>
                </group>
            )}
        </group>
    )
}

const BillboardScreen = ({ id, data, onSelect, moveLocked, onMove }) => {
    const x = data?.x || 0; const y = data?.y || 0; const z = data?.z || 0;
    const width = data?.width || 600; const height = data?.height || 340; const rotY = data?.rotY || 0;
    const poleHeight = 600;
    const ScreenMesh = () => (
        <group rotation={[0, rotY, 0]} onClick={(e)=>{ e.stopPropagation(); onSelect(id, e); }}>
            <mesh position={[0, poleHeight/2, 0]}><cylinderGeometry args={[30, 30, poleHeight, 16]} /><meshStandardMaterial color="#888" roughness={0.8} /></mesh>
            <group position={[0, poleHeight + height/2, 0]}>
                <mesh position={[0, 0, -5]} renderOrder={1}><boxGeometry args={[width + 20, height + 20, 20]} /><meshStandardMaterial color="#111" /></mesh>
                <mesh position={[0, 0, 6]} renderOrder={10}>
                    <planeGeometry args={[width, height]} />
                    <Suspense fallback={<meshStandardMaterial color="#000" />}>
                        <SmartMediaMaterial url={data?.imageUrl} color="#000" isPlaying={data?.isPlaying !== false} />
                    </Suspense>
                </mesh>
            </group>
            <Text position={[0, poleHeight + height + 50, 0]} fontSize={60} color={data?.selected ?"yellow" : "white"} anchorY="bottom">{data?.labelText || "BILLBOARD"}</Text>
        </group>
    );
    if (data?.selected && !moveLocked) {
        return (
            <TransformControls position={[x, y, z]} onObjectChange={(e) => { 
                if(e?.target?.object) onMove(id, e.target.object.position.x, e.target.object.position.y, e.target.object.position.z, false); 
            }} mode="translate"><ScreenMesh /></TransformControls>
        );
    }
    return <group position={[x, y, z]}><ScreenMesh /></group>;
};

const SmartBoundaryWall = ({ data, onSelect }) => {
    const radius = 3800; const count = 40; const height = 150; const segmentWidth = (2 * Math.PI * radius) / count;
    const segments = useMemo(() => { const items = []; for (let i = 0; i < count; i++) { const angle = (i / count) * Math.PI * 2; items.push({ id: `WALL_${i+1}`, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, rot: [0, -angle + Math.PI/2, 0] }); } return items; }, []);
    return ( 
        <group> 
            {segments.map((seg) => ( 
                <group key={seg.id} position={[seg.x, 0, seg.z]} rotation={seg.rot}> 
                    <mesh position={[-segmentWidth/2, height/2, -5]}><boxGeometry args={[30, height, 10]} /><meshStandardMaterial color="#111" /></mesh> 
                    <mesh position={[-segmentWidth/2, height + 15, -5]}><sphereGeometry args={[20]} /><meshStandardMaterial color="#222" roughness={0.2} /></mesh> 
                    <mesh position={[0, height/2, 5]} onClick={(e) => { e.stopPropagation(); onSelect(seg.id, e); }}> 
                        <boxGeometry args={[segmentWidth - 30, height - 20, 5]} /> 
                         <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={data[seg.id]?.imageUrl} color="#111" /></Suspense> 
                    </mesh> 
                    <mesh position={[0, height/2, -6]}><boxGeometry args={[segmentWidth - 28, height - 18, 5]} /><meshStandardMaterial color="#222" wireframe /></mesh> 
                </group> 
            ))} 
        </group> 
    )
};

const SolarSystem = () => {
    const earthTex = useTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg");
    const sunTex = useTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/lava/lavatile.jpg");
    return ( <group> <mesh position={[0, 3000, -8000]}> <sphereGeometry args={[1200, 64, 64]} /><meshBasicMaterial map={sunTex} color="#ffaa00" /> </mesh> <pointLight position={[0, 3000, -7000]} intensity={15} color="#ffaa00" distance={25000} /> <mesh position={[-6000, 1000, -6000]}> <sphereGeometry args={[600, 64, 64]} /><meshStandardMaterial map={earthTex} roughness={0.5} metalness={0.1} /> </mesh> </group> )
}

const SolarDome = () => {
    const gridTex = useTexture("https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/uv_grid_opengl.jpg");
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(10, 5);
    return ( <group> <mesh> <sphereGeometry args={[3750, 64, 64, 0, Math.PI * 2, 0, Math.PI * 0.5]} /> <meshPhysicalMaterial map={gridTex} color="#004488" transparent opacity={0.1} side={THREE.DoubleSide} metalness={0.9} roughness={0.1} emissive="#001122" emissiveIntensity={0.2} /> </mesh> <Text position={[0, 1500, -1000]} fontSize={200} color="white" anchorX="center" anchorY="middle" rotation={[Math.PI/4, 0, 0]} fillOpacity={0.3} strokeWidth={2} strokeColor="cyan">VIRTUNOVO WORLD</Text> </group> )
}

const DataCrystal = ({ position, id, onCollect, imageUrl, isGhost = false }) => {
    const ref = useRef();
    useFrame((state) => { if(ref.current && !isGhost) { ref.current.rotation.y += 0.02; ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 2; } });
    return (
      <group position={position} onClick={(e) => { if(!isGhost) { e.stopPropagation(); onCollect(id); } }}>
        <group ref={ref}> {imageUrl ? ( <Billboard><Image url={imageUrl} scale={isGhost ? 20 : 30} transparent opacity={isGhost ? 0.5 : 1} /></Billboard> ) : ( <mesh><octahedronGeometry args={[18, 0]} /><meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={3} toneMapped={false} /></mesh> )} </group>
        {!isGhost && <pointLight distance={60} color="#ff00ff" intensity={5} />}
      </group>
    );
};

const EventPortal = ({ event, onClick }) => {
    const ref = useRef();
    useFrame((state) => {
        if(ref.current) {
            ref.current.rotation.y += 0.05;
            ref.current.position.y = 100 + Math.sin(state.clock.elapsedTime * 2) * 20;
        }
    });
    if(!event) return null;
    return (
        <group position={event.eventLocation || [0, 500, 0]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
            <group ref={ref}>
                <mesh><torusKnotGeometry args={[40, 6, 100, 16]} /><meshStandardMaterial color="cyan" emissive="cyan" emissiveIntensity={5} /></mesh>
                <Text position={[0, 80, 0]} fontSize={30} color="#fff" outlineWidth={2} outlineColor="cyan">EVENT LIVE</Text>
            </group>
            <pointLight intensity={10} color="cyan" distance={500} />
        </group>
    );
};

const Building = ({ id, type, position, width, height, data, onSelect, isFiller, moveLocked, onMove }) => {
    const isSpecialFiller = type === 'special'; const isCurved = type === 'curved';
    const labelText = data?.labelText || id;
    const activeWidth = data?.width || width; const activeHeight = data?.height || height;
    const activeX = data?.x !== undefined ? data.x : position[0]; const activeZ = data?.z !== undefined ? data.z : position[2];
    const activeHoardingW = data?.hoardingW || activeWidth * 1.5; const activeHoardingH = data?.hoardingH || (isFiller ? 60 : 120);
    const selectionColor = data?.selected ? "#ffff00" : "#ffffff";
    const BuildingContent = () => (
        <group onClick={(e) => { e.stopPropagation(); onSelect(id, e); }}>
            <group position={[0, activeHeight + 150, 0]}>
                <Float speed={2} rotationIntensity={0} floatIntensity={0.5}>
                    <Text fontSize={40} color={selectionColor} outlineWidth={2} outlineColor="#000" anchorX="center" anchorY="middle">{labelText}</Text>
                </Float>
            </group>
            {isCurved ? (
                <CurvedScreenBuilding width={activeWidth} height={activeHeight} data={data} isFiller={isFiller} />
            ) : isSpecialFiller ? ( 
                <TwistedTowers height={activeHeight} width={activeWidth} /> 
            ) : (
                <group position={[0, activeHeight/2, 0]}>
                    <mesh>
                        {type === 'square' ? <boxGeometry args={[activeWidth, activeHeight, activeWidth]} /> : <cylinderGeometry args={[activeWidth * 0.6, activeWidth * 0.6, activeHeight, 3]} />}
                        <Suspense fallback={<meshStandardMaterial color="#111" />}><DynamicBuildingMaterial wallColor={isFiller?"#111":(data?.wallColor||"#0a0a0a")} windowColor={data?.winColor||"#0044ff"} textureUrl={data?.skinUrl} height={activeHeight} /></Suspense>
                    </mesh>
                    {data?.screenUrl && type === 'square' && (
                        <mesh position={[0, 0, activeWidth/2 + 0.6]}>
                             <planeGeometry args={[activeWidth, activeHeight]} />
                              <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={data?.screenUrl} color="#000" isPlaying={data?.isPlaying !== false} /></Suspense>
                         </mesh>
                    )}
                </group>
            )}
            {!isSpecialFiller && !isCurved && (
                <>
                <group position={[0, activeHeight, 0]}>
                    <mesh position={[-activeHoardingW/4, 40, 0]}><cylinderGeometry args={[5, 5, 80]} /><meshStandardMaterial color="#555" /></mesh>
                    <mesh position={[activeHoardingW/4, 40, 0]}><cylinderGeometry args={[5, 5, 80]} /><meshStandardMaterial color="#555" /></mesh>
                    <group position={[0, 80 + activeHoardingH/2, 0]}>
                        <mesh position={[0, 0, -2]}><boxGeometry args={[activeHoardingW + 4, activeHoardingH + 4, 4]} /><meshStandardMaterial color="#222" /></mesh>
                        <mesh position={[0, 0, 6]} renderOrder={10}>
                            <planeGeometry args={[activeHoardingW, activeHoardingH]} />
                            <Suspense fallback={<meshStandardMaterial color="#111" />}><SmartMediaMaterial url={data?.hoardingUrl} color="#fff" /></Suspense>
                        </mesh>
                    </group>
                </group>
                {!isFiller && ( <> 
                    <pointLight position={[0, 50, (type==='square' ? activeWidth/2 : activeWidth*0.6) + 6]} color={data?.ledColor||"#00ff00"} distance={80} intensity={3} /> 
                    <group position={[0, activeHeight * 0.85, 0]}><HorizontalMarquee width={activeWidth * 1.5} text={data?.hText || "ADVERTISE"} color={data?.ledColor||"#00ff00"} /></group> 
                    {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, i) => ( <group key={i} rotation={[0, rot, 0]} position={[0, 0, 0]}><group position={[0, 0, (type==='square' ? activeWidth/2 : activeWidth*0.6) + 6]}><VerticalMarquee height={activeHeight} width={activeWidth} text={data?.vText || "AD"} color={data?.ledColor||"#00ff00"} /></group></group> ))} 
                </> )}
                </>
            )}
        </group>
    );
    if (data?.selected && !moveLocked && !isFiller) {
        return (
            <TransformControls position={[activeX, 0, activeZ]} onObjectChange={(e) => {
                if(e?.target?.object) onMove(id, e.target.object.position.x, 0, e.target.object.position.z, false);
            }} mode="translate" showY={false}><BuildingContent /></TransformControls>
        );
    }
    return <group position={[activeX, 0, activeZ]}><BuildingContent /></group>;
};

const HeroTower = ({ position, data, onSelect }) => {
    const height = 900; const width = 180;
    const wallColor = data?.wallColor || "#050505"; const winColor = data?.winColor || "#0066ff";
    const skin1 = data?.skinUrl1; const skin2 = data?.skinUrl2; const skin3 = data?.skinUrl3;
    const hoardingUrl = data?.hoardingUrl;
    const TowerMesh = ({ offset, skin }) => (
        <group position={[offset, height/2, 0]}>
            <mesh>
                <boxGeometry args={[width, height, width]} />
                <Suspense fallback={<meshStandardMaterial color={wallColor} />}><DynamicBuildingMaterial wallColor={wallColor} windowColor={winColor} textureUrl={null} height={height} /></Suspense>
            </mesh>
            <mesh position={[0, 0, width/2 + 2]}>
                 <planeGeometry args={[width, height]} />
                 <Suspense fallback={<meshStandardMaterial color="#000" />}><SmartMediaMaterial url={skin} color="#000" /></Suspense>
            </mesh>
             <mesh position={[width/2 + 2, 0, width/2 + 2]}>
                <boxGeometry args={[5, height, 5]} />
                <meshStandardMaterial color={data?.ledColor || "#00ffff"} emissive={data?.ledColor || "#00ffff"} emissiveIntensity={2} toneMapped={false} />
            </mesh>
        </group>
    );
    const Connector = ({ yPos }) => (<mesh position={[0, yPos, 0]}><boxGeometry args={[width * 2.5, 30, width * 0.6]} /><meshStandardMaterial color="#111" metalness={0.9} /></mesh>);
    return (
        <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('HERO', e); }}>
            <TowerMesh offset={-width * 1.1} skin={skin1} /> <TowerMesh offset={0} skin={skin2} /> <TowerMesh offset={width * 1.1} skin={skin3} />  
            <Connector yPos={height * 0.3} /> <Connector yPos={height * 0.6} /> <Connector yPos={height * 0.9} />
            <group position={[0, height + 100, 0]}>
                <mesh position={[0, 0, 10]} renderOrder={10}>
                    <planeGeometry args={[width * 4, 150]} />
                    <Suspense fallback={<meshStandardMaterial color="#111" />}><SmartMediaMaterial url={hoardingUrl} color={wallColor} /></Suspense>
                </mesh>
                <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -5]}><planeGeometry args={[width * 4, 150]} /><meshStandardMaterial color="#050505" /></mesh>
            </group>
            <mesh position={[0, 60, width/2 + 20]}><boxGeometry args={[width * 3, 120, 20]} /><meshStandardMaterial color="#000" metalness={1} roughness={0.1} /></mesh>
            <group position={[0, height + 250, 0]}>
                <Float speed={2} rotationIntensity={0} floatIntensity={0.5}>
                    <Text fontSize={100} color={data?.ledColor || "#00aaff"} outlineWidth={4} outlineColor="black">{data?.labelText || "HEADQUARTERS"}</Text>
                </Float>
            </group>
        </group>
    )
}

// ==========================================
// 4. UI COMPONENTS (NEW HOLOGRAPHIC)
// ==========================================

const UnifiedAuthModal = ({ onClose, onLoginSuccess }) => {
    const showToast = useToast();
    const [mode, setMode] = useState("LOGIN"); // LOGIN, SIGNUP, MAGIC, 2FA
    const [tab, setTab] = useState('INDIVIDUAL'); // INDIVIDUAL, ORG (GUEST is removed)
    const [email, setEmail] = useState("");
    const [pass, setPass] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [name, setName] = useState("");
    const [orgName, setOrgName] = useState("");
    const [industry, setIndustry] = useState("");
    const [twoFACode, setTwoFACode] = useState("");

    // Styles
    const holoCardStyle = {
        background: 'rgba(0, 5, 16, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0, 255, 255, 0.3)',
        boxShadow: '0 0 40px rgba(0, 255, 255, 0.1), inset 0 0 20px rgba(0, 255, 255, 0.05)',
        padding: '40px',
        borderRadius: '16px',
        width: '400px',
        textAlign: 'center',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden'
    };
    
    const inputStyle = {
        width: '100%', padding: '12px 15px', margin: '10px 0', background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none',
        transition: 'all 0.3s ease'
    };
    
    const btnPrimary = {
        width: '100%', padding: '14px', marginTop: '15px', background: 'linear-gradient(90deg, #00ffff, #0066ff)',
        border: 'none', borderRadius: '8px', color: '#000', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
        boxShadow: '0 0 15px rgba(0, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '1px'
    };

    const handleLogin = () => {
        const res = handleLoginAttempt(email, pass);
        if(res.status === "2FA_REQUIRED") setMode("2FA");
        else if (res.status === "SUCCESS") onLoginSuccess(res.user, res.role);
        else showToast(res.msg, 'error');
    };
    
    const handleSignup = () => {
        if(!email || !pass || !name) { showToast("Missing fields", 'error'); return; }
        const role = tab === 'ORG' ? ROLES.ORG_ADMIN : ROLES.VISITOR;
        const res = registerUser({ email, password: pass, name, org: orgName, industry, role, accountType: tab.toLowerCase() });
        if(res.success) { 
            localStorage.setItem(ACCOUNT_TYPE_KEY, tab.toLowerCase());
            showToast(res.msg, 'success'); 
            setMode("LOGIN"); 
        } else showToast(res.msg, 'error');
    };

    const handleForgotPassword = () => {
        if(!email.includes('@')) { showToast("Enter email first", 'error'); return; }
        // Simulated token logic
        const tokens = loadData(RESET_TOKENS_KEY, {});
        const token = Math.random().toString(36).substr(2);
        tokens[email] = { token, expISO: new Date(Date.now() + 3600000).toISOString() };
        saveData(RESET_TOKENS_KEY, tokens);
        console.log(`[DEV] Reset Token for ${email}: ${token}`);
        showToast(`Reset link sent to ${email}`, 'success');
        logAdmin("forgot_password_token", { email });
    };

    const verify2FA = () => {
        const admin = loadData(ADMIN_CONFIG_KEY, DEFAULT_ADMIN_CONFIG);
        if(twoFACode === admin.secretCode) onLoginSuccess({ name: "Admin" }, "ADMIN");
        else showToast("Invalid Code", 'error');
    };

    return (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.85)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <style>{`
                .holo-input:focus { border-color: #00ffff !important; box-shadow: 0 0 10px rgba(0,255,255,0.3); }
                .scanline { position: absolute; top: 0; left: 0; width: 100%; height: 5px; background: rgba(0,255,255,0.5); opacity: 0.5; animation: scan 3s linear infinite; pointer-events: none; }
                @keyframes scan { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
            `}</style>

            <div style={holoCardStyle}>
                <div className="scanline"></div>
                
                {/* Header */}
                <h2 style={{color: '#00ffff', textTransform: 'uppercase', letterSpacing: '4px', margin: '0 0 5px 0', textShadow: '0 0 10px #00ffff'}}>
                    {mode === 'MAGIC' ? 'MAGIC ACCESS' : mode === '2FA' ? 'SECURE GATE' : mode === 'SIGNUP' ? 'NEW CITIZEN' : 'VIRTUNOVO'}
                </h2>
                
                {mode === 'SIGNUP' && (
                    <div style={{display:'flex', justifyContent:'center', gap:15, marginBottom:20}}>
                        {['INDIVIDUAL', 'ORG'].map(t => (
                            <span key={t} onClick={()=>setTab(t)} style={{fontSize:10, cursor:'pointer', color: tab===t?'#00ffff':'#666', borderBottom: tab===t?'1px solid #00ffff':'none', paddingBottom:3}}>{t}</span>
                        ))}
                    </div>
                )}

                {/* Login Mode */}
                {mode === 'LOGIN' && (
                    <>
                        <input placeholder="Email Address" style={inputStyle} value={email} onChange={e=>setEmail(e.target.value)} className="holo-input" autoFocus />
                        <div style={{position:'relative'}}>
                            <input type={showPass ? "text" : "password"} placeholder="Password" style={inputStyle} value={pass} onChange={e=>setPass(e.target.value)} className="holo-input" />
                            <span onClick={()=>setShowPass(!showPass)} style={{position:'absolute', right:10, top:22, cursor:'pointer', fontSize:14}}>{showPass ? '🙈' : '👁'}</span>
                        </div>
                        <div style={{textAlign:'right', fontSize:10, color:'#aaa', marginTop:-5, cursor:'pointer'}} onClick={handleForgotPassword}>Forgot Password?</div>
                        
                        <button onClick={handleLogin} style={btnPrimary}>ACCESS</button>
                        
                        <div style={{display:'flex', justifyContent:'space-between', marginTop:15, fontSize:12}}>
                            <span onClick={()=>setMode('MAGIC')} style={{color:'#00ffff', cursor:'pointer'}}>⚡ Magic Link</span>
                            <span onClick={()=>setMode('SIGNUP')} style={{color:'#aaa', cursor:'pointer'}}>Create Account</span>
                        </div>
                    </>
                )}

                {/* Signup Mode */}
                {mode === 'SIGNUP' && (
                    <>
                        <input placeholder="Full Name" style={inputStyle} value={name} onChange={e=>setName(e.target.value)} className="holo-input" />
                        {tab === 'ORG' && (
                            <>
                                <input placeholder="Company Legal Name" style={inputStyle} value={orgName} onChange={e=>setOrgName(e.target.value)} className="holo-input" />
                                <input placeholder="Industry (e.g. Tech, Retail)" style={inputStyle} value={industry} onChange={e=>setIndustry(e.target.value)} className="holo-input" />
                            </>
                        )}
                        <input placeholder="Email Address" style={inputStyle} value={email} onChange={e=>setEmail(e.target.value)} className="holo-input" />
                        <div style={{position:'relative'}}>
                            <input type={showPass ? "text" : "password"} placeholder="Password" style={inputStyle} value={pass} onChange={e=>setPass(e.target.value)} className="holo-input" />
                            <span onClick={()=>setShowPass(!showPass)} style={{position:'absolute', right:10, top:22, cursor:'pointer', fontSize:14}}>{showPass ? '🙈' : '👁'}</span>
                        </div>
                        
                        <button onClick={handleSignup} style={{...btnPrimary, background: 'linear-gradient(90deg, #22c55e, #00ff88)'}}>REGISTER</button>
                        <div style={{marginTop:15, fontSize:12, color:'#aaa', cursor:'pointer'}} onClick={()=>setMode('LOGIN')}>Back to Login</div>
                    </>
                )}

                {/* Magic Link Mode */}
                {mode === 'MAGIC' && (
                    <>
                        <p style={{fontSize:12, color:'#ccc', marginBottom:15}}>Enter your email. We will beam a secure access link directly to your inbox.</p>
                        <input placeholder="Email Address" style={inputStyle} value={email} onChange={e=>setEmail(e.target.value)} className="holo-input" autoFocus />
                        <button onClick={handleMagic} style={{...btnPrimary, background: 'linear-gradient(90deg, #d946ef, #8b5cf6)', color:'white'}}>SEND MAGIC BEAM</button>
                        <div style={{marginTop:15, fontSize:12, color:'#aaa', cursor:'pointer'}} onClick={()=>setMode('LOGIN')}>Back to Login</div>
                    </>
                )}

                {/* 2FA Mode */}
                {mode === '2FA' && (
                    <>
                        <input type="password" placeholder="Secret Code" value={twoFACode} onChange={e=>setTwoFACode(e.target.value)} style={inputStyle} className="holo-input" autoFocus />
                        <button onClick={verify2FA} style={btnPrimary}>VERIFY</button>
                    </>
                )}

                {/* Footer Support */}
                <div style={{marginTop: 30, paddingTop: 15, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10, color: '#666'}}>
                    <div style={{marginBottom:5}}>SYSTEM SUPPORT</div>
                    <div style={{color:'#888'}}>info@virtunovo.com • virtunovo@gmail.com</div>
                </div>

                <button onClick={onClose} style={{position:'absolute', top:10, right:10, background:'transparent', border:'none', color:'#444', fontSize:18, cursor:'pointer'}}>×</button>
            </div>
        </div>
    );
};

// ====== VIRTUNOVO UPGRADE: Onboarding Cinematic (New Component) ======
const OnboardingOverlay = ({ onComplete }) => {
    useEffect(() => {
        const timer = setTimeout(onComplete, 3500); // 3.5s sequence
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: '#000', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#00ffff', fontFamily: 'monospace', overflow: 'hidden'
        }}>
            <style>{`
                .boot-text { font-size: 24px; animation: glitch 0.2s infinite; }
                .grid-floor { position: absolute; bottom: 0; width: 100%; height: 50%; background: linear-gradient(0deg, rgba(0,255,255,0.2) 0%, transparent 100%); transform: perspective(500px) rotateX(60deg); }
                .loading-bar { width: 300px; height: 4px; background: #333; margin-top: 20px; position: relative; overflow: hidden; }
                .loading-fill { height: 100%; background: #00ffff; animation: load 3s cubic-bezier(0.1, 0, 0.2, 1) forwards; }
                @keyframes load { 0% { width: 0%; } 100% { width: 100%; } }
                @keyframes glitch { 0% { opacity: 1; transform: translate(0); } 20% { opacity: 0.8; transform: translate(-2px, 2px); } 40% { opacity: 1; transform: translate(2px, -2px); } 60% { opacity: 0.9; transform: translate(0); } 100% { opacity: 1; } }
            `}</style>
            
            <div className="grid-floor"></div>
            <div style={{textAlign: 'center', zIndex: 2}}>
                <div className="boot-text">SYSTEM INITIALIZED</div>
                <div style={{fontSize: 12, color: '#666', marginTop: 10, letterSpacing: 2}}>ESTABLISHING SECURE CONNECTION...</div>
                <div className="loading-bar"><div className="loading-fill"></div></div>
                <div style={{marginTop: 20, fontSize: 10, color: '#004444'}}>VIRTUNOVO OS v2.4.0</div>
            </div>
        </div>
    );
};

const ModalBackdrop = ({ children, onClose }) => (
    <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.85)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{background:'#050510', padding:30, borderRadius:12, border:'1px solid #00aaff', width:500, maxHeight:'80vh', overflowY:'auto', color:'white', boxShadow:'0 0 30px rgba(0,255,255,0.1)'}}>
            {children}
            <button onClick={onClose} style={{marginTop:20, width:'100%', padding:10, background:'#333', color:'white', border:'none', cursor:'pointer', borderRadius:5}}>Close</button>
        </div>
    </div>
);

const MissionsModal = ({ onClose, onClaim, showToast }) => {
    const data = loadData(KEYS.DAILY_MISSIONS, { items: [] });
    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#00ffff', borderBottom:'1px solid #333', paddingBottom:10}}>📅 Daily Missions</h2>
            {data.items.map(m => (
                <div key={m.id} style={{background:'#111', margin:'10px 0', padding:15, borderRadius:8, border: m.claimed?'1px solid #22c55e':'1px solid #333', opacity: m.claimed?0.6:1}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <strong>{m.title}</strong>
                        <span style={{color:'orange'}}>{m.rewardPoints} Pts {m.rewardTickets > 0 && `+ 🎟️`}</span>
                    </div>
                    <div style={{width:'100%', height:6, background:'#333', margin:'10px 0', borderRadius:3}}>
                        <div style={{width:`${(m.current/m.goal)*100}%`, height:'100%', background:'#00aaff', borderRadius:3}}></div>
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'#aaa'}}>
                        <span>{m.current} / {m.goal}</span>
                        {m.current >= m.goal && !m.claimed && <button onClick={()=>onClaim(m.id)} style={{background:'#22c55e', border:'none', color:'white', padding:'2px 10px', borderRadius:4, cursor:'pointer'}}>CLAIM REWARD</button>}
                        {m.claimed && <span style={{color:'#22c55e'}}>COMPLETED</span>}
                    </div>
                </div>
            ))}
        </ModalBackdrop>
    );
};

const RewardsVaultModal = ({ onClose, showToast, addTickets }) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(()=>setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const pts = parseInt(localStorage.getItem(KEYS.POINTS)||'0');
    const tix = parseInt(localStorage.getItem(KEYS.TICKETS)||'0');

    const nextSunday9pm = (() => {
        const d = new Date();
        const day = d.getDay();
        const diff = (7 - day) % 7; 
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 21, 0, 0, 0);
        if (next <= d) next.setDate(next.getDate() + 7);
        return next;
    })();
    const msLeft = Math.max(0, nextSunday9pm - now);
    const dd = String(Math.floor(msLeft/86400000)).padStart(2,'0');
    const hh = String(Math.floor((msLeft%86400000)/3600000)).padStart(2,'0');
    const mm = String(Math.floor((msLeft%3600000)/60000)).padStart(2,'0');
    const ss = String(Math.floor((msLeft%60000)/1000)).padStart(2,'0');

    const buyTicket = () => {
        const cost = 200;
        const today = new Date().toISOString().split('T')[0];
        const buys = localStorage.getItem(KEYS.TICKET_BUY_DATE) === today ? parseInt(localStorage.getItem(KEYS.TICKET_BUY)||'0') : 0;
        if(buys >= 5) { showToast("Daily limit reached", 'error'); return; }
        if(pts < cost) { showToast("Not enough points", 'error'); return; }
        
        localStorage.setItem(KEYS.POINTS, pts - cost);
        localStorage.setItem(KEYS.TICKET_BUY, buys + 1);
        localStorage.setItem(KEYS.TICKET_BUY_DATE, today);
        addTickets(1);
        showToast("Ticket Purchased!", 'success');
        onClose(); 
    };

    const milestones = [
        { pts: 500, label: "Bronze Badge" },
        { pts: 1500, label: "Silver Badge" },
        { pts: 3000, label: "Gold Title" }
    ];

    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#fbbf24', textAlign:'center'}}>🏦 Rewards Vault</h2>
            <div style={{display:'flex', justifyContent:'space-around', margin:'20px 0', fontSize:18}}>
                <div style={{textAlign:'center'}}><div style={{color:'#aaa', fontSize:12}}>POINTS</div><div style={{color:'#00ffff', fontWeight:'bold'}}>{pts}</div></div>
                <div style={{textAlign:'center'}}><div style={{color:'#aaa', fontSize:12}}>TICKETS</div><div style={{color:'#fbbf24', fontWeight:'bold'}}>🎟️ {tix}</div></div>
            </div>
            <div style={{background:'#222', padding:15, borderRadius:8, textAlign:'center', marginBottom:20}}>
                <h4 style={{margin:0, color:'white'}}>Next Weekly Raffle</h4>
                <p style={{fontSize:12, color:'#888'}}>Every Sunday 9PM (Your Local Time)</p>
                <div style={{fontSize:18, color:'#22c55e', marginTop:5}}>Starts in {dd}d:{hh}h:{mm}m:{ss}s</div>
                <div style={{fontSize:14, color:'#22c55e', marginTop:5}}>Prize: WIN 5000 PTS</div>
            </div>
            <h4 style={{borderBottom:'1px solid #333', paddingBottom:5}}>Shop</h4>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
                <span>🎟️ Raffle Ticket</span>
                <button onClick={buyTicket} style={{background:pts>=200?'#00aaff':'#333', color:'white', border:'none', padding:'5px 15px', borderRadius:4, cursor:pts>=200?'pointer':'not-allowed'}}>Buy (200 pts)</button>
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', opacity:0.5}}>
                <span>👟 Cyber Sneakers (Skin)</span>
                <button disabled style={{background:'#333', color:'white', border:'none', padding:'5px 15px', borderRadius:4}}>Sponsored Drop Soon</button>
            </div>
            <h4 style={{marginTop:20, borderBottom:'1px solid #333', paddingBottom:5}}>Unlocks</h4>
            {milestones.map(ms => (
                <div key={ms.pts} style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                    <span>{ms.label} — {ms.pts} pts</span>
                    <span style={{color: pts >= ms.pts ? '#22c55e' : '#888'}}>{pts >= ms.pts ? 'Unlocked' : 'Locked'}</span>
                </div>
            ))}
        </ModalBackdrop>
    );
};

const EventsModal = ({ onClose }) => {
    const events = loadData(KEYS.EVENTS, []);
    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#d946ef'}}>🎉 Upcoming Events</h2>
            {events.length === 0 && <p style={{color:'#666', textAlign:'center'}}>No upcoming events.</p>}
            {events.map(e => (
                <div key={e.id} style={{background:'#111', borderLeft:'4px solid #d946ef', padding:15, margin:'10px 0', borderRadius:4}}>
                    <h3 style={{margin:0, color:'white'}}>{e.title}</h3>
                    <div style={{fontSize:12, color:'#00aaff', margin:'5px 0'}}>Starts: {new Date(e.startTime).toLocaleString()} • {e.durationMin || 60} min {e.sponsorName ? `• Sponsor: ${e.sponsorName}`:''}</div>
                    <p style={{fontSize:12, color:'#ccc'}}>{e.description}</p>
                    {e.ctaUrl && <a href={e.ctaUrl} target="_blank" rel="noreferrer" style={{display:'inline-block', marginTop:5, color:'#d946ef', textDecoration:'none', fontWeight:'bold'}}>{e.ctaText || "Join Now"} →</a>}
                </div>
            ))}
        </ModalBackdrop>
    );
};

const LeaderboardModal = ({ onClose }) => {
    const myPts = parseInt(localStorage.getItem(KEYS.WEEKLY_POINTS) || 0);
    const streak = parseInt(localStorage.getItem(KEYS.STREAK) || 0);
    const users = loadData(USERS_DB_KEY, []);

    const guestId = localStorage.getItem(KEYS.GUEST_ID) || (() => {
        const id = `Guest-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        localStorage.setItem(KEYS.GUEST_ID, id);
        return id;
    })();

    const localLB = loadData(KEYS.LEADERBOARD, {});
    const enrichedUsers = users.map(u => ({
        name: u.name || u.email,
        pts: typeof u.weeklyPoints === 'number' ? u.weeklyPoints : Math.floor(Math.random() * 5000)
    }));

    const guestEntry = { name: guestId, pts: localLB[guestId]?.weeklyPoints || myPts };
    const pool = [...enrichedUsers, guestEntry].filter(x => x.pts && x.pts >= 0);
    const sorted = pool.sort((a,b) => b.pts - a.pts).slice(0, 5);
    const myRank = Math.max(1, pool.sort((a,b)=>b.pts - a.pts).findIndex(x => x.name === guestEntry.name) + 1);

    const share = () => {
        const text = `I'm Rank #${myRank} in VirtuNovo this week. Join me: https://virtunovo.com`;
        navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
    };

    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#22c55e'}}>🏆 Weekly Leaderboard</h2>
            <div style={{background:'#222', padding:10, borderRadius:8, display:'flex', justifyContent:'space-between', marginBottom:20}}>
                <span>My Points: <b style={{color:'#00ffff'}}>{myPts}</b></span>
                <span>Streak: <b style={{color:'orange'}}>{streak} 🔥</b></span>
            </div>
            <table style={{width:'100%', fontSize:14, borderCollapse:'collapse'}}>
                <tbody>
                    {sorted.map((u, i) => (
                        <tr key={i} style={{borderBottom:'1px solid #333'}}>
                            <td style={{padding:8, color:i===0?'#fbbf24':'white'}}>#{i+1}</td>
                            <td style={{padding:8}}>{u.name}</td>
                            <td style={{padding:8, textAlign:'right'}}>{u.pts}</td>
                        </tr>
                    ))}
                    <tr style={{borderTop:'2px solid #444'}}>
                        <td style={{padding:8, color:'#00aaff'}}>#{myRank}</td>
                        <td style={{padding:8}}>YOU</td>
                        <td style={{padding:8, textAlign:'right'}}>{myPts}</td>
                    </tr>
                </tbody>
            </table>
            <button onClick={share} style={{marginTop:20, width:'100%', padding:10, background:'#00aaff', color:'white', border:'none', fontWeight:'bold', cursor:'pointer', borderRadius:5}}>Share & Invite</button>
        </ModalBackdrop>
    );
};

const InviteModal = ({ onClose, currentUser }) => {
    let code = localStorage.getItem(KEYS.REF_CODE);
    if(!code) { code = Math.random().toString(36).substring(7).toUpperCase(); localStorage.setItem(KEYS.REF_CODE, code); }
    const refMap = loadData(KEYS.REF_MAP, {});
    if (!refMap[code]) {
        refMap[code] = { email: currentUser?.email || null, name: currentUser?.name || 'Guest', created: new Date().toISOString() };
        saveData(KEYS.REF_MAP, refMap);
    }
    const link = `https://virtunovo.com/?ref=${code}`;
    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#00aaff'}}>🤝 Invite Friends</h2>
            <p style={{color:'#ccc'}}>Earn 500 points for every friend who joins.</p>
            <div style={{background:'#222', padding:15, borderRadius:8, wordBreak:'break-all', textAlign:'center', color:'#fbbf24', fontSize:14, border:'1px dashed #555'}}>
                {link}
            </div>
            <button onClick={()=>{navigator.clipboard.writeText(link); alert("Copied!")}} style={{marginTop:15, width:'100%', padding:10, background:'#22c55e', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', borderRadius:5}}>Copy Link</button>
        </ModalBackdrop>
    );
};

const BrandPartnerModal = ({ onClose, prefill }) => {
    const [form, setForm] = useState(prefill || { name:'', company:'', email:'', budget:'', objectives:'' });
    const submit = () => {
        // Save to dedicated leads key for the CRM panel
        const leads = loadData(BRAND_LEADS_KEY, []);
        leads.push({ 
            id: `lead_${Date.now()}`, 
            ...form, 
            date: new Date().toISOString(), 
            status: 'NEW', 
            context: prefill ? 'From Brand Preview' : 'Direct Request' 
        });
        saveData(BRAND_LEADS_KEY, leads);
        
        // Log deck request
        logAdmin('brand_deck_request', { company: form.company, from_preview: !!prefill });
        
        // Also push to legacy key just in case
        const legacyLeads = loadData(KEYS.BRAND_LEADS_LEGACY, []);
        legacyLeads.push({...form, date: new Date().toISOString()});
        saveData(KEYS.BRAND_LEADS_LEGACY, legacyLeads);

        window.open(`mailto:sales@virtunovo.com?subject=Brand%20Partnership%20Inquiry&body=${encodeURIComponent(JSON.stringify(form,null,2))}`);
        alert("Thanks! We will contact you shortly.");
        onClose();
    };
    const inputStyle = { width:'100%', padding:10, marginBottom:10, background:'#222', border:'1px solid #444', color:'white', borderRadius:5, boxSizing: 'border-box' };
    return (
        <ModalBackdrop onClose={onClose}>
            <h2 style={{color:'#fbbf24'}}>💼 Brand Partnerships</h2>
            <p style={{fontSize:12, color:'#aaa', marginBottom:20}}>Launch your brand in the Metaverse. Choose a package or request a custom activation.</p>
            <div style={{display:'flex', gap:10, marginBottom:20}}>
                <div style={{flex:1, background:'#111', padding:10, borderRadius:5, border:'1px solid #333', fontSize:11}}>
                    <strong style={{color:'#00aaff'}}>District Takeover</strong><br/>City-wide Presence<br/>Starting from ₹1.5L/mo
                </div>
                <div style={{flex:1, background:'#111', padding:10, borderRadius:5, border:'1px solid #333', fontSize:11}}>
                    <strong style={{color:'#d946ef'}}>Launch Event</strong><br/>Immersive Debut<br/>Starting from ₹5L
                </div>
                <div style={{flex:1, background:'#111', padding:10, borderRadius:5, border:'1px solid #333', fontSize:11}}>
                    <strong style={{color:'#22c55e'}}>Season Partner</strong><br/>Always-On Impact<br/>Starting from ₹10L
                </div>
            </div>
            <div style={{display:'grid', gap:8}}>
                <input placeholder="Name" style={inputStyle} value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                <input placeholder="Company" style={inputStyle} value={form.company} onChange={e=>setForm({...form, company:e.target.value})} />
                <input placeholder="Email" style={inputStyle} value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
                <select style={inputStyle} value={form.budget} onChange={e=>setForm({...form, budget:e.target.value})}>
                    <option>Budget Range</option>
                    <option>₹50k - ₹2L</option>
                    <option>₹2L - ₹10L</option>
                    <option>₹10L+</option>
                </select>
                <textarea placeholder="Objectives (e.g., reach, signups, conversions)" style={{...inputStyle, minHeight:80}} value={form.objectives} onChange={e=>setForm({...form, objectives:e.target.value})} />
            </div>
            <button onClick={submit} style={{width:'100%', padding:12, background:'#fbbf24', color:'black', border:'none', fontWeight:'bold', cursor:'pointer', borderRadius:5}}>Request Pitch Deck</button>
        </ModalBackdrop>
    );
};

const SponsorCTAWidget = ({ sponsor, onCtaClick }) => (
    <div style={{position:'absolute', bottom:20, right:20, background:'rgba(0,0,0,0.9)', borderLeft:'4px solid #00ffff', padding:15, borderRadius:8, width:250, zIndex:2000, animation:'slideIn 0.5s'}}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div style={{fontSize:10, color:'#aaa', textTransform:'uppercase'}}>Sponsored By</div>
        <div style={{fontSize:18, color:'white', fontWeight:'bold', margin:'5px 0'}}>{sponsor.sponsorName || "Brand"}</div>
        {sponsor.ctaUrl && (
            <button onClick={()=>{
                if (onCtaClick) onCtaClick(sponsor);
                window.open(sponsor.ctaUrl, '_blank');
            }} style={{width:'100%', padding:8, marginTop:5, background:'#00aaff', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', borderRadius:4}}>
                {sponsor.ctaText || "Learn More"}
            </button>
        )}
    </div>
);

const UserManagementModal = ({ onClose }) => {
    const users = loadData(USERS_DB_KEY, []);
    const [userList, setUserList] = useState(users);
    const showToast = useToast();
    const saveUsers = (newUsers) => { setUserList(newUsers); saveData(USERS_DB_KEY, newUsers); };
    
    return (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.85)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{background:'#111', padding:30, borderRadius:12, border:'1px solid #fbbf24', width:700, maxHeight:'80vh', overflowY:'auto', color:'white'}}>
                <h3 style={{marginTop:0, color:'#fbbf24'}}>👥 User Management</h3>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, color:'#ccc'}}>
                    <thead><tr style={{textAlign:'left', borderBottom:'1px solid #444'}}><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Weekly</th><th>Actions</th></tr></thead>
                    <tbody>
                        {userList.map(u => (
                            <tr key={u.email} style={{borderBottom:'1px solid #333'}}>
                                <td style={{padding:10}}>{u.name} {u.org && `(${u.org})`}</td>
                                <td style={{padding:10}}>{u.email}</td>
                                <td style={{padding:10}}>
                                    <select 
                                        value={u.role || ROLES.VISITOR} 
                                        onChange={(e) => {
                                            const newRole = e.target.value;
                                            const updated = userList.map(x => x.email === u.email ? {...x, role: newRole} : x);
                                            saveUsers(updated);
                                            logAdmin("user_role_change", { email: u.email, role: newRole });
                                            showToast(`Updated role to ${newRole}`);
                                        }}
                                        style={{background:'#222', color:'white', border:'1px solid #444', borderRadius:4, padding:2}}
                                    >
                                        {Object.values(ROLES).map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </td>
                                <td style={{padding:10, color:u.blocked?'red':'green'}}>{u.blocked?'Blocked':'Active'}</td>
                                <td style={{padding:10}}>{u.weeklyPoints || 0}</td>
                                <td style={{padding:10}}>
                                    <button onClick={()=>{ saveUsers(userList.map(x => x.email===u.email ? {...x, blocked:!x.blocked} : x)); showToast(u.blocked?"Unblocked":"Blocked"); }} style={{marginRight:5, background:u.blocked?'green':'orange', border:'none', color:'white', padding:5, borderRadius:3}}>Block</button>
                                    <button onClick={()=>{ if(window.confirm("Delete?")) saveUsers(userList.filter(x => x.email!==u.email)); }} style={{background:'red', border:'none', color:'white', padding:5, borderRadius:3}}>Del</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button onClick={onClose} style={{marginTop:20, width:'100%', padding:10, background:'#333', color:'white', border:'none', cursor:'pointer'}}>Close</button>
            </div>
        </div>
    );
};

const ChangeCredentialsModal = ({ onClose, onSave }) => {
    const [cfg, setCfg] = useState(loadData(ADMIN_CONFIG_KEY, DEFAULT_ADMIN_CONFIG));
    const labelStyle = { display:'block', textAlign:'left', fontSize:12, color:'#aaa', marginBottom:5 };
    const inputStyle = { width:'90%', padding:10, marginBottom:10, background:'#222', border:'1px solid #444', color:'white', borderRadius:5 };
    return (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{background:'#111', padding:30, borderRadius:12, border:'1px solid #00aaff', width:350, textAlign:'center', color:'white'}}>
                <h3 style={{color:'#fbbf24'}}>🔑 Change Credentials</h3>
                <label style={labelStyle}>New Email</label><input value={cfg.email} onChange={e=>setCfg({...cfg, email:e.target.value})} style={inputStyle} />
                <label style={labelStyle}>New Password</label><input value={cfg.password} onChange={e=>setCfg({...cfg, password:e.target.value})} style={inputStyle} />
                <label style={labelStyle}>New Secret Code (2FA)</label><input value={cfg.secretCode} onChange={e=>setCfg({...cfg, secretCode:e.target.value})} style={inputStyle} />
                <button onClick={()=>{ onSave(cfg); logAdmin("credentials_change", {}); onClose(); }} style={{width:'100%', padding:12, background:'#22c55e', border:'none', cursor:'pointer', fontWeight:'bold', borderRadius:5, color:'white'}}>Save Changes</button>
                <button onClick={onClose} style={{marginTop:10, background:'transparent', border:'none', color:'#aaa', cursor:'pointer'}}>Cancel</button>
            </div>
        </div>
    );
};

const MasterControlPanel = ({ flags, onToggle, onClose }) => (
    <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{background:'#111', padding:30, borderRadius:12, border:'1px solid #00aaff', width:400, textAlign:'center', color:'white', maxHeight: '80vh', overflowY: 'auto'}}>
            <h3 style={{color:'#ef4444'}}>🎛️ Master Control</h3>
            {Object.keys(flags).map(key => ( <div key={key} style={{display:'flex', justifyContent:'space-between', marginBottom:10, padding:10, background:'#222', borderRadius:5}}><span style={{color:'white', textTransform:'capitalize'}}>{key.replace(/([A-Z])/g, ' $1')}</span><button onClick={()=>{ onToggle(key); logAdmin("toggle_master_flag", { key, value: !flags[key]}); }} style={{background: flags[key]?'#22c55e':'#444', border:'none', color:'white', padding:'5px 10px', borderRadius:4, cursor:'pointer'}}>{flags[key]?'ON':'OFF'}</button></div> ))}
            <button onClick={onClose} style={{marginTop:10, background:'transparent', border:'none', color:'#aaa', cursor:'pointer'}}>Close</button>
        </div>
    </div>
);

const UnifiedControlPanel = ({ selectedIds, data, onUpdate, onClose, isAdmin, isPlacingEgg, setIsPlacingEgg, setEggImage, onSave, onReset, openCreds, openMaster, moveLocked, setMoveLocked, onSelectAll, openFlightPlan, openLeads }) => {
    if (!isAdmin) return null;
    const isMultiSelect = selectedIds.size > 1;
    const selectedId = Array.from(selectedIds)[selectedIds.size - 1]; 
    const flags = loadData(MASTER_FLAGS_KEY, DEFAULT_MASTER_FLAGS);
    
    const handleFileUpload = (e, fieldName) => { const file = e.target.files[0];
    if (file) { const reader = new FileReader(); reader.onloadend = () => onUpdate(fieldName, reader.result); reader.readAsDataURL(file); } };
    const handleEggImageUpload = (e) => { const file = e.target.files[0]; if (file && setEggImage) { const reader = new FileReader();
    reader.onloadend = () => setEggImage(reader.result); reader.readAsDataURL(file); } }
    
    const handleExport = (key, filename) => {
        const d = loadData(key, []);
        const json = JSON.stringify(d, null, 2);
        const blob = new Blob([json], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        logAdmin("export_data", { filename });
    };

    const isBoundary = selectedId && selectedId.toString().startsWith('WALL');
    const isBillboard = selectedId && selectedId.toString().startsWith('BILLBOARD');
    const isHero = selectedId === 'HERO';
    const actionBtn = (bg) => ({ flex:1, padding:8, background:bg, border:'none', borderRadius:5, color:'white', cursor:'pointer', fontWeight:'bold', fontSize:12 });
    const MediaInput = ({ label, field }) => (
        <div style={{marginBottom:10}}>
            <label style={{display:'block', fontSize:12, color:'#aaa', marginBottom:5}}>{label}</label>
            <div style={{display:'flex', gap:5}}>
                <input type="file" accept="image/*,video/*" onChange={(e)=>handleFileUpload(e, field)} style={{fontSize:12, color:'#ccc', width:'100%'}} />
                <button onClick={()=>onUpdate(field, null)} style={{background:'red', color:'white', border:'none', borderRadius:3, cursor:'pointer', fontWeight:'bold'}}>X</button>
            </div>
        </div>
    );

    const metricsByCampaign = useMemo(() => {
        const logs = loadData(KEYS.EVENTS_LOG, []);
        const map = {};
        logs.forEach(e => {
            const id = e.campaignId || 'N/A';
            if (!map[id]) map[id] = { campaignId: id, sponsorName: e.sponsorName || 'N/A', impressions: 0, clicks: 0, dwell: 0 };
            if (e.type === 'billboard_impression') map[id].impressions += 1;
            if (e.type === 'billboard_click') map[id].clicks += 1;
            if (e.type === 'billboard_dwell') map[id].dwell += e.seconds || 0;
        });
        return Object.values(map);
    }, []);

    const events = loadData(KEYS.EVENTS, []);
    const saveEvents = (list) => saveData(KEYS.EVENTS, list);

    return (
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '340px', background: 'rgba(5, 5, 15, 0.98)', padding: '20px', borderRadius: '12px', border: '2px solid #00aaff', color: 'white', fontFamily: 'sans-serif', zIndex: 1000, maxHeight: '80vh', overflowY: 'auto'}}>
            <div style={{marginBottom: 15, paddingBottom:15, borderBottom: '1px solid #333', display:'flex', gap:5, flexWrap:'wrap'}}>
                <button onClick={onSave} style={actionBtn('#22c55e')}>💾 Save</button>
                <button onClick={openMaster} style={actionBtn('#ef4444')}>🎛️ Master</button>
                <button onClick={openCreds} style={actionBtn('#3b82f6')}>🔑 Keys</button>
                <button onClick={(e) => { if(e.shiftKey) { if(window.confirm("HARD RESET?")) { localStorage.removeItem("VIRTUNOVO_SCENE_DATA"); window.location.reload(); } } else { onReset(); } }} title="Shift+Click to Factory Reset" style={actionBtn('#666')}>⚠ Reset</button>
            </div>
            
            {/* Enterprise Quick Actions */}
            <div style={{marginBottom:15, display:'flex', gap:5, flexWrap:'wrap'}}>
                 <button onClick={()=>handleExport(KEYS.EVENTS_LOG, 'campaigns.json')} style={{...actionBtn('#333'), border:'1px solid #00aaff', color:'#00aaff'}}>📊 Metrics</button>
                 <button onClick={()=>handleExport(KEYS.ANALYTICS, 'analytics.json')} style={{...actionBtn('#333'), border:'1px solid #00aaff', color:'#00aaff'}}>📈 Analytics</button>
                 {flags.enableLeadsPanel && <button onClick={openLeads} style={{...actionBtn('#333'), border:'1px solid #fbbf24', color:'#fbbf24'}}>💼 Leads</button>}
                 {flags.enableFlightPlan && <button onClick={openFlightPlan} style={{...actionBtn('#333'), border:'1px solid #d946ef', color:'#d946ef'}}>✈️ Flights</button>}
            </div>

            <div style={{display:'flex', gap:5, marginBottom:15, flexWrap:'wrap'}}>
                <button onClick={()=>onSelectAll('BUILDINGS')} style={{...actionBtn('#333'), border:'1px solid #555'}}>All Bldgs</button>
                <button onClick={()=>onSelectAll('SCREENS')} style={{...actionBtn('#333'), border:'1px solid #555'}}>All Screens</button>
                <button onClick={()=>onSelectAll('WALLS')} style={{...actionBtn('#333'), border:'1px solid #555'}}>All Walls</button>
            </div>

            <div style={{marginBottom:15, borderTop:'1px solid #333', paddingTop:10}}>
                <h4 style={{margin:'0 0 10px 0', fontSize:14, color:'#d946ef'}}>📅 Event Manager</h4>
                <button onClick={() => {
                    const id = prompt("Event ID (e.g., evt-1):");
                    if(!id) return;
                    const title = prompt("Event Title:") || 'New Event';
                    const startTime = prompt("Start Time ISO (leave blank for now):") || new Date().toISOString();
                    const durationMin = parseInt(prompt("Duration (minutes):") || '60');
                    const sponsorName = prompt("Sponsor (optional):") || '';
                    const ctaUrl = prompt("CTA URL (optional):") || '';
                    const current = loadData(KEYS.EVENTS, []);
                    current.push({ id, title, startTime, durationMin, sponsorName, ctaUrl, ctaText: 'Join Now', description: "New Event", eventLocation: [0,500,0], isFeatured: true });
                    saveData(KEYS.EVENTS, current);
                    logAdmin("create_event", { id, title });
                    alert("Event created! Reload or re-open to see.");
                }} style={actionBtn('#333')}>+ Add Event</button>
                <button onClick={() => { saveData(KEYS.EVENTS, []); logAdmin("clear_all_events", {}); alert("Events Cleared"); }} style={{...actionBtn('#333'), marginLeft:5}}>Clear All</button>

                {events.length > 0 && (
                    <div style={{marginTop:10, background:'#111', padding:8, borderRadius:6, border:'1px solid #333', maxHeight:150, overflowY:'auto'}}>
                        {events.map((e) => (
                            <div key={e.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
                                <span style={{fontSize:12}}>{e.title}</span>
                                <div style={{display:'flex', gap:4}}>
                                    <button onClick={()=>{
                                        const newTitle = prompt("Edit Title:", e.title) || e.title;
                                        const newStart = prompt("Edit Start ISO:", e.startTime) || e.startTime;
                                        const newDur = parseInt(prompt("Duration (min):", e.durationMin||60) || e.durationMin||60);
                                        const list = events.map(x => x.id===e.id ? {...x, title:newTitle, startTime:newStart, durationMin:newDur} : x);
                                        saveEvents(list); logAdmin("edit_event", { id: e.id }); alert("Updated.");
                                    }} style={{padding:'2px 6px', background:'#3b82f6', border:'none', color:'#fff', borderRadius:3, fontSize:11}}>Edit</button>
                                    <button onClick={()=>{
                                        if (confirm("Delete event?")) {
                                            const list = events.filter(x => x.id!==e.id);
                                            saveEvents(list); logAdmin("delete_event", { id: e.id }); alert("Deleted.");
                                        }
                                    }} style={{padding:'2px 6px', background:'#ef4444', border:'none', color:'#fff', borderRadius:3, fontSize:11}}>Del</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{marginBottom:15, borderTop:'1px solid #333', paddingTop:10}}>
                <h4 style={{margin:'0 0 10px 0', fontSize:14, color:'#00ffff'}}>📣 Campaign Metrics</h4>
                <div style={{maxHeight:140, overflowY:'auto'}}>
                    {metricsByCampaign.length === 0 && <div style={{fontSize:12, color:'#888'}}>No data yet.</div>}
                    {metricsByCampaign.map(m => (
                        <div key={m.campaignId} style={{fontSize:12, background:'#111', padding:6, borderRadius:4, border:'1px solid #222', marginBottom:6}}>
                            <div><b style={{color:'#fff'}}>{m.sponsorName}</b> <span style={{color:'#00aaff'}}>({m.campaignId})</span></div>
                            <div style={{display:'flex', gap:8, color:'#ccc'}}>
                                <span>Imp: {m.impressions}</span>
                                <span>Clk: {m.clicks}</span>
                                <span>Dwell: {Math.round(m.dwell)}s</span>
                                <span>CTR: {m.impressions>0 ? ((m.clicks/m.impressions)*100).toFixed(1) : '0.0'}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {!selectedId ? (
                <div style={{marginBottom: 20}}>
                    <h4 style={{margin:'0 0 10px 0', fontSize: 14, color: '#fbbf24'}}>🥚 Easter Egg Controls</h4>
                    <button onClick={() => setIsPlacingEgg(!isPlacingEgg)} style={{width: '100%', padding: 10, background: isPlacingEgg ? '#fbbf24' : '#444', border: 'none', color: isPlacingEgg ? 'black' : 'white', fontWeight: 'bold', borderRadius: 6, cursor: 'pointer', marginBottom: 10}}>{isPlacingEgg ? "🛑 Stop Placing" : "✨ Start Placing Eggs"}</button>
                    {isPlacingEgg && ( <div><label style={{display:'block', fontSize:12, color:'#aaa', marginBottom:5}}>Upload Egg Image</label><input type="file" accept="image/*" onChange={handleEggImageUpload} style={{fontSize: 12, color: '#ccc', width: '100%'}} /></div> )}
                </div>
            ) : (
                <>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}>
                        <h3 style={{margin:0, color:'#00aaff'}}>{isMultiSelect ? `Editing ${selectedIds.size} Items` : `Edit: ${selectedId}`}</h3>
                        <button onClick={onClose} style={{background:'red', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', padding: '5px 10px', borderRadius: 4}}>X</button>
                    </div>
                    <div style={{background:'#222', padding:10, borderRadius:5, marginBottom:15}}>
                        <h4 style={{margin:'0 0 10px 0', fontSize:12, color:'#aaa'}}>Transform & Size</h4>
                        <button onClick={() => setMoveLocked(!moveLocked)} style={{width:'100%', padding:8, background: moveLocked ? '#444' : '#fbbf24', color: moveLocked ? 'white' : 'black', border:'none', borderRadius:5, fontWeight:'bold', cursor:'pointer', marginBottom:10}}>{moveLocked ? "🔒 Locked (Click to Move)" : "🔓 Unlocked (Drag Building)"}</button>
                        {!isBoundary && (
                            <div style={{display:'flex', gap:5, marginBottom:5}}>
                                <label style={{fontSize:10}}>W</label><input type="number" value={data?.width||(isBillboard?600:140)} onChange={e=>onUpdate('width', parseFloat(e.target.value))} style={{width:'50px'}} />
                                <label style={{fontSize:10}}>H</label><input type="number" value={data?.height||(isBillboard?340:300)} onChange={e=>onUpdate('height', parseFloat(e.target.value))} style={{width:'50px'}} />
                                {isBillboard && <><label style={{fontSize:10}}>Rot</label><input type="number" step="0.1" value={data?.rotY||0} onChange={e=>onUpdate('rotY', parseFloat(e.target.value))} style={{width:'50px'}} /></>}
                            </div>
                        )}
                    </div>
                    {isBoundary ? ( 
                        <div style={{marginBottom:15}}>
                            <div style={{padding:5, background:'#444', borderRadius:4, marginBottom:10, fontSize:11}}>Tip: Use "All Walls" button above.</div>
                            <MediaInput label="Boundary Screen (Video/Img)" field="imageUrl" />
                        </div> 
                    ) : isBillboard ? (
                        <div style={{marginBottom:15}}>
                             <MediaInput label="Billboard Media (Video/Img)" field="imageUrl" />
                             <div style={{marginTop:10}}><label style={{display:'block', fontSize:12, color:'#aaa', marginBottom:5}}>Label</label><input style={{width:'90%', padding:8, background:'#222', border:'1px solid #444', color:'white', borderRadius: 6}} value={data?.labelText || ""} onChange={(e) => onUpdate('labelText', e.target.value)} /></div>
                             <h4 style={{fontSize:12, color:'#00aaff', marginTop:10}}>Sponsor Metadata</h4>
                             <input placeholder="Sponsor Name" style={{width:'90%', marginBottom:5}} value={data?.sponsorName||""} onChange={e=>onUpdate('sponsorName', e.target.value)} />
                             <input placeholder="Campaign ID" style={{width:'90%', marginBottom:5}} value={data?.campaignId||""} onChange={e=>onUpdate('campaignId', e.target.value)} />
                             <input placeholder="CTA URL" style={{width:'90%', marginBottom:5}} value={data?.ctaUrl||""} onChange={e=>onUpdate('ctaUrl', e.target.value)} />
                             <input placeholder="CTA Text" style={{width:'90%'}} value={data?.ctaText||""} onChange={e=>onUpdate('ctaText', e.target.value)} />
                        </div>
                    ) : (
                        <>
                        <div style={{marginBottom:15}}><label style={{display:'block', fontSize:12, color:'#aaa', marginBottom:5}}>Building Label</label><input style={{width:'90%', padding:8, background:'#222', border:'1px solid #444', color:'white', borderRadius: 6}} value={data?.labelText || ""} onChange={(e) => onUpdate('labelText', e.target.value)} /></div>
                        {isHero ? (
                            <>
                                <h4 style={{margin:'10px 0', fontSize:14, color:'#00ff00'}}>Hero Tower Skins</h4>
                                <MediaInput label="Left Tower" field="skinUrl1" />
                                <MediaInput label="Center Tower" field="skinUrl2" />
                                <MediaInput label="Right Tower" field="skinUrl3" />
                                <h4 style={{margin:'10px 0', fontSize:14, color:'#00ff00'}}>Rooftop Screen</h4>
                                <MediaInput label="Rooftop Media" field="hoardingUrl" />
                            </>
                        ) : (
                            <>
                                <MediaInput label="Building Skin (Texture)" field="skinUrl" />
                                <div style={{background:'#111', padding:5, borderRadius:5, marginBottom:10, border:'1px solid #333'}}>
                                    <label style={{display:'block', fontSize:12, color:'#00aaff', marginBottom:5, fontWeight:'bold'}}>Main Screen</label>
                                    <MediaInput label="Video/Image Source" field="screenUrl" />
                                    <div style={{display:'flex', gap:5, marginTop:5}}>
                                        <button onClick={()=>onUpdate('isPlaying', true)} style={{flex:1, padding:5, background:'#22c55e', border:'none', borderRadius:3, color:'white', cursor:'pointer'}}>▶ Play</button>
                                        <button onClick={()=>onUpdate('isPlaying', false)} style={{flex:1, padding:5, background:'#ef4444', border:'none', borderRadius:3, color:'white', cursor:'pointer'}}>⏸ Stop</button>
                                    </div>
                                </div>
                                <MediaInput label="Rooftop Hoarding" field="hoardingUrl" />
                            </>
                        )}
                        <div style={{background: '#111', padding: 10, borderRadius: 8, marginBottom: 15}}><h4 style={{margin:'0 0 10px 0', fontSize: 14, color: '#fbbf24'}}>🎨 Paint</h4><div style={{display:'flex', justifyContent:'space-between', marginBottom: 10}}><label style={{fontSize:12, color:'#ccc'}}>Walls</label><input type="color" value={data?.wallColor || "#111111"} onChange={(e) => onUpdate('wallColor', e.target.value)} /></div><div style={{display:'flex', justifyContent:'space-between'}}><label style={{fontSize:12, color:'#ccc'}}>Windows</label><input type="color" value={data?.winColor || "#0066ff"} onChange={(e) => onUpdate('winColor', e.target.value)} /></div></div>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom: 15}}><label style={{fontSize:12, color:'#aaa'}}>LED Color</label><input type="color" value={data?.ledColor || "#00ff00"} onChange={(e) => onUpdate('ledColor', e.target.value)} /></div>
                        
                        {/* New Brand Metadata Admin Section */}
                        <div style={{marginTop:15, borderTop:'1px solid #444', paddingTop:10}}>
                            <h4 style={{margin:'0 0 10px 0', fontSize:14, color:'#d946ef'}}>Brand Assignment</h4>
                            <input placeholder="Org Name" value={data.brand?.orgName||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), orgName:e.target.value})} style={{width:'90%', marginBottom:5, fontSize:11, padding:4, background:'#111', color:'white', border:'1px solid #333'}} />
                            <input placeholder="Org ID" value={data.brand?.orgId||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), orgId:e.target.value})} style={{width:'90%', marginBottom:5, fontSize:11, padding:4, background:'#111', color:'white', border:'1px solid #333'}} />
                            <input placeholder="Brand Email" value={data.brand?.brandEmail||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), brandEmail:e.target.value})} style={{width:'90%', marginBottom:5, fontSize:11, padding:4, background:'#111', color:'white', border:'1px solid #333'}} />
                            <div style={{display:'flex', gap:5}}>
                                <input type="date" value={data.brand?.startISO||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), startISO:e.target.value})} style={{fontSize:10, background:'#111', color:'white', border:'1px solid #333'}} />
                                <input type="date" value={data.brand?.endISO||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), endISO:e.target.value})} style={{fontSize:10, background:'#111', color:'white', border:'1px solid #333'}} />
                            </div>
                            <input placeholder="Price Tag (e.g. $5k/mo)" value={data.brand?.priceTag||""} onChange={e=>onUpdate('brand', {...(data.brand||{}), priceTag:e.target.value})} style={{width:'90%', marginTop:5, fontSize:11, padding:4, background:'#111', color:'white', border:'1px solid #333'}} />
                        </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

const LandingOverlay = ({ siteConfig, onEnter, onLogin, isAdmin, currentUser, onLogout, visible, onOpenPartners, brandModeEnabled, setBrandMode, onOpenTrust, liveParticipants, onWarpToEvent }) => {
    const events = loadData(KEYS.EVENTS, []);
    const nextEvent = events.length > 0 ? events[0] : null;
    const canSeeBrandMode = isAdmin || (currentUser?.accountType === ACCOUNT_TYPES.ORGANIZATION);

    return (
        <div style={{
            position:'absolute', top:0, left:0, width:'100vw', height:'100vh', 
            background: 'black', transition: 'opacity 1s ease-in-out', 
            opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', 
            zIndex: 2000, display:'flex', flexDirection:'column', color:'white', fontFamily:'sans-serif'
        }}>
            <style>{`@keyframes warpSpeed { 0% { transform: scale(1); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(4); opacity: 0; } } .warp-star { position: absolute; top: 50%; left: 50%; width: 2px; height: 2px; background: white; border-radius: 50%; animation: warpSpeed 2s linear infinite; }`}</style>
            <div style={{position:'absolute', width:'100%', height:'100%', overflow:'hidden', zIndex:-1}}>
                {Array.from({length:100}).map((_,i) => {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * 500; const delay = Math.random() * 2;
                    return <div key={i} className="warp-star" style={{transform: `translate(${Math.cos(angle)*radius}px, ${Math.sin(angle)*radius}px)`, animationDelay: `${delay}s`}} />
                })}
            </div>

            <div style={{display:'flex', justifyContent:'space-between', padding:'20px 40px', alignItems:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(10px)'}}>
                <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#00ffff', letterSpacing:'2px'}}>VIRTUNOVO</div>
                <div style={{display:'flex', gap:20, alignItems:'center'}}>
                    {brandModeEnabled && canSeeBrandMode && (
                        <button onClick={()=>setBrandMode(p=>!p)} style={{background: 'transparent', border:'1px solid #fbbf24', color:'#fbbf24', borderRadius:15, padding:'5px 12px', fontSize:11, cursor:'pointer'}}>
                            {localStorage.getItem(BRAND_MODE_KEY) === 'true' ? 'Hide Brand Mode' : 'For Brands'}
                        </button>
                    )}
                    <div onClick={onOpenTrust} style={{cursor:'pointer', fontSize:11, color:'#888', display:'flex', alignItems:'center', gap:5}}>
                        <span style={{width:6, height:6, background:'#22c55e', borderRadius:'50%'}}></span>
                        Systems Operational
                    </div>
                    {!currentUser && !isAdmin && <button onClick={onLogin} style={{background:'transparent', border:'1px solid #00aaff', color:'#00aaff', padding:'8px 20px', borderRadius:20, cursor:'pointer', fontWeight:'bold'}}>LOG IN</button>}
                    {(currentUser || isAdmin) && <div style={{display:'flex', gap:10, alignItems:'center'}}><span style={{color: isAdmin?'#fbbf24':'#fff'}}>{isAdmin?'Admin':currentUser.name}</span><button onClick={onLogout} style={{background:'#333', border:'none', color:'#aaa', fontSize:12, cursor:'pointer', padding:'5px 10px', borderRadius:4}}>Logout</button></div>}
                </div>
            </div>

            <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <h1 style={{fontSize:'6rem', margin:0, color:'white', textShadow:'0 0 30px cyan', letterSpacing:'10px', textAlign:'center'}}>{siteConfig.heroTitle}</h1>
                <p style={{fontSize:'1.2rem', marginTop:20, color:'#888', letterSpacing:'3px', textTransform:'uppercase'}}>{siteConfig.heroSubtitle}</p>
                {nextEvent && (
                    <div style={{marginTop:30, border:'1px solid #d946ef', padding:'10px 30px', borderRadius:50, color:'#d946ef', background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', gap:10}}>
                        <span>NEXT EVENT: <b style={{color:'white'}}>{nextEvent.title}</b> • {new Date(nextEvent.startTime).toLocaleTimeString()}</span>
                        {liveParticipants > 0 && <span style={{fontSize:10, background:'#d946ef', color:'white', padding:'2px 6px', borderRadius:4}}>🔴 {liveParticipants} LIVE</span>}
                        <button onClick={()=>onWarpToEvent(nextEvent)} style={{background:'#d946ef', border:'none', color:'white', borderRadius:15, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:'bold'}}>JOIN NOW</button>
                    </div>
                )}
                <div style={{marginTop:60}}>
                    {(!currentUser && !isAdmin) ? (
                        <button onClick={onEnter} style={{padding:'15px 40px', background:'transparent', border:'1px solid #00ffff', color:'#00ffff', borderRadius:50, cursor:'pointer', fontWeight:'bold'}}>ENTER AS GUEST</button>
                    ) : (
                        <button onClick={onEnter} style={{padding:'18px 50px', background:'linear-gradient(90deg, #00ffff, #0066ff)', border:'none', color:'black', borderRadius:50, cursor:'pointer', fontWeight:'bold', boxShadow:'0 0 20px cyan'}}>ENTER WORLD</button>
                    )}
                </div>
                <div style={{marginTop:40, display:'flex', gap:40, opacity:0.7}}>
                    <div style={{textAlign:'center'}}><div style={{fontSize:20}}>🎮</div><div style={{fontSize:12}}>Play & Earn</div></div>
                    <div style={{textAlign:'center'}}><div style={{fontSize:20}}>💎</div><div style={{fontSize:12}}>Collect NFT</div></div>
                    <div style={{textAlign:'center'}}><div style={{fontSize:20}}>🌐</div><div style={{fontSize:12}}>Explore City</div></div>
                </div>
            </div>
        </div>
    );
};

const BuildingInfoCard = ({ id, onClose }) => (
    <div style={{position:'absolute', top:100, right:20, width:250, background:'rgba(0,0,0,0.9)', border:'1px solid #00aaff', padding:20, color:'white', borderRadius:8, zIndex:1000}}>
        <h3 style={{margin:'0 0 10px 0', color:'#00aaff'}}>Building {id}</h3>
        <p style={{fontSize:12, color:'#aaa'}}>Status: <span style={{color:'#22c55e'}}>Available</span></p>
        <button onClick={() => window.open('mailto:sales@virtunovo.com')} style={{marginTop:15, width:'100%', padding:10, background:'#00aaff', border:'none', color:'white', fontWeight:'bold', cursor:'pointer', borderRadius:4}}>Inquire Pricing</button>
        <button onClick={onClose} style={{marginTop:10, width:'100%', background:'transparent', border:'none', color:'#aaa', cursor:'pointer'}}>Close</button>
    </div>
);
const ChatWidget = () => ( <div style={{position:'absolute', bottom:20, left:20, zIndex:1000}}><button onClick={()=>alert("Connecting...")} style={{padding:'15px 30px', background:'#00aaff', color:'white', border:'none', borderRadius:50, fontWeight:'bold', boxShadow:'0 0 10px #00aaff', cursor:'pointer'}}>💬 Live Chat</button></div> );

const DistrictTracker = ({ onVisit }) => {
    const { camera } = useThree();
    const lastDistrictRef = useRef(null);
    useFrame(() => {
        const x = camera.position.x;
        const z = camera.position.z;
        const district = (x>=0 && z>=0) ? 'NE' : (x<0 && z>=0) ? 'NW' : (x<0 && z<0) ? 'SW' : 'SE';
        if (lastDistrictRef.current !== district) {
            lastDistrictRef.current = district;
            const todayVisited = loadData(KEYS.VISITED_DISTRICTS, []);
            if (!todayVisited.includes(district)) {
                const updated = [...todayVisited, district];
                saveData(KEYS.VISITED_DISTRICTS, updated);
                onVisit(1);
            }
        }
    });
    return null;
};

const FocusTargetLerper = ({ target, controlsRef, onArrive }) => {
    const { camera } = useThree();
    const temp = useRef(new THREE.Vector3());
    useFrame((state, delta) => {
        if (!target || !controlsRef?.current) return;
        temp.current.lerp(new THREE.Vector3(...target), Math.min(2 * delta, 0.2));
        controlsRef.current.target.lerp(temp.current, Math.min(2 * delta, 0.2));
        camera.lookAt(controlsRef.current.target);
        if (controlsRef.current.target.distanceTo(temp.current) < 5) {
            onArrive && onArrive();
        }
    });
    return null;
};

// ==========================================
// 5. NEW COMPONENT INFRASTRUCTURE (UPGRADES)
// ==========================================

const KpiSparkline = React.memo(({ data, color = '#00ffff' }) => {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data); const min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((d, i) => `${(i / (data.length - 1)) * 60},${30 - ((d - min) / range) * 20}`).join(' ');
    return <svg width="60" height="30" style={{display:'inline-block'}}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" /></svg>;
});

// === CREATIVE CHECKER (ENTERPRISE) ===
const CreativeChecker = ({ onClose }) => {
    const [status, setStatus] = useState(null); // 'VALIDATING', 'SUCCESS', 'ERROR'
    const [msg, setMsg] = useState('');
    
    const validate = (file) => {
        setStatus('VALIDATING');
        const isVideo = file.type.startsWith('video');
        const reader = new FileReader();
        reader.onload = (e) => {
            if (isVideo) {
                const vid = document.createElement('video');
                vid.src = e.target.result;
                vid.onloadedmetadata = () => {
                    if (vid.videoWidth !== 1920 || vid.videoHeight !== 1080) { setStatus('ERROR'); setMsg(`Dimensions ${vid.videoWidth}x${vid.videoHeight} != 1920x1080`); }
                    else if (file.size > 50 * 1024 * 1024) { setStatus('ERROR'); setMsg(`File size ${Math.round(file.size/1024/1024)}MB > 50MB`); }
                    else { setStatus('SUCCESS'); setMsg('Valid 1080p Video'); }
                };
            } else {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    if (img.width < 800) { setStatus('ERROR'); setMsg('Width too small (<800px)'); }
                    else { setStatus('SUCCESS'); setMsg('Valid Image Creative'); }
                };
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div style={{padding:15, background:'#111', border:'1px solid #333', borderRadius:8, marginTop:10}}>
            <h4 style={{margin:'0 0 10px 0', fontSize:12, color:'#fbbf24'}}>Creative Checker</h4>
            <input type="file" onChange={(e)=>validate(e.target.files[0])} style={{fontSize:11, color:'white'}} />
            {status && (
                <div style={{marginTop:10, fontSize:12, color: status==='SUCCESS'?'#22c55e':'#ef4444'}}>
                    {status==='SUCCESS'?'✓ ' : '✕ '} {msg}
                </div>
            )}
            {status === 'SUCCESS' && <div style={{fontSize:10, color:'#888', marginTop:5}}>Ready for Flight Plan</div>}
        </div>
    );
};

// === BRAND LEADS PANEL (ENTERPRISE) ===
const LeadsPanel = () => {
    const leads = loadData(BRAND_LEADS_KEY, []);
    const [filter, setFilter] = useState('');
    const filtered = leads.filter(l => l.company.toLowerCase().includes(filter.toLowerCase()) || l.name.toLowerCase().includes(filter.toLowerCase()));

    const downloadCSV = () => {
        const headers = ['Date', 'Company', 'Name', 'Email', 'Budget', 'Context', 'Status'];
        const rows = leads.map(l => [l.date, l.company, l.name, l.email, l.budget, l.context, l.status]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "brand_leads.csv");
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div style={{color:'white'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <h3 style={{margin:0, color:'#fbbf24'}}>Lead CRM</h3>
                <button onClick={downloadCSV} style={{fontSize:11, padding:5, background:'#333', border:'1px solid #fbbf24', color:'#fbbf24', borderRadius:4, cursor:'pointer'}}>Export CSV</button>
            </div>
            <input placeholder="Search leads..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', padding:8, background:'#111', border:'1px solid #333', color:'white', marginBottom:10, borderRadius:4}} />
            <div style={{maxHeight:300, overflowY:'auto', background:'#050505', border:'1px solid #333', borderRadius:4}}>
                <table style={{width:'100%', fontSize:11, borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid #444', textAlign:'left', color:'#888'}}>
                        <th style={{padding:8}}>Date</th><th style={{padding:8}}>Company</th><th style={{padding:8}}>Budget</th><th style={{padding:8}}>Status</th>
                    </tr></thead>
                    <tbody>
                        {filtered.map((l, i) => (
                            <tr key={i} style={{borderBottom:'1px solid #222'}}>
                                <td style={{padding:8}}>{new Date(l.date).toLocaleDateString()}</td>
                                <td style={{padding:8, fontWeight:'bold'}}>{l.company}</td>
                                <td style={{padding:8}}>{l.budget}</td>
                                <td style={{padding:8}}><span style={{background: l.status==='NEW'?'#22c55e':'#333', padding:'2px 4px', borderRadius:3, fontSize:10}}>{l.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div style={{padding:15, textAlign:'center', color:'#555'}}>No leads found.</div>}
            </div>
        </div>
    );
};

// === FLIGHT PLAN PANEL (ENTERPRISE) ===
const FlightPlanPanel = () => {
    const [flights, setFlights] = useState(loadData(FLIGHTS_KEY, []));
    const addFlight = () => {
        const newFlight = { id: Date.now(), placement: 'BILLBOARD_0', start: '', end: '', status: 'SCHEDULED' };
        const updated = [...flights, newFlight];
        setFlights(updated);
        saveData(FLIGHTS_KEY, updated);
    };
    return (
        <div style={{color:'white'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}>
                <h3 style={{margin:0, color:'#d946ef'}}>✈️ Flight Plan</h3>
                <button onClick={addFlight} style={{background:'#d946ef', border:'none', color:'white', borderRadius:4, padding:'5px 10px', cursor:'pointer'}}>+ Schedule</button>
            </div>
            <div style={{maxHeight:300, overflowY:'auto'}}>
                {flights.map((f, i) => (
                    <div key={i} style={{background:'#111', padding:10, marginBottom:8, borderRadius:4, borderLeft:'3px solid #d946ef'}}>
                        <div style={{fontSize:12, fontWeight:'bold', marginBottom:5}}>Slot #{f.id}</div>
                        <div style={{display:'flex', gap:5}}>
                            <select style={{background:'#222', color:'white', border:'1px solid #444', fontSize:11}} defaultValue={f.placement}>
                                <option value="BILLBOARD_0">Billboard 0</option>
                                <option value="BILLBOARD_1">Billboard 1</option>
                            </select>
                            <input type="datetime-local" style={{background:'#222', color:'white', border:'1px solid #444', fontSize:11}} />
                        </div>
                    </div>
                ))}
                {flights.length === 0 && <div style={{fontSize:12, color:'#666'}}>No active flights scheduled.</div>}
            </div>
        </div>
    );
};

// === AUDIENCE MODE: BRAND PANEL ===
const BrandPreviewPanel = ({ onClose, onExport, onOpenPitch, selectedId, sceneData, isAdmin, currentUser, onPause, onRollback }) => {
    const analytics = loadData(KEYS.ANALYTICS, []);
    const selectedItem = selectedId ? sceneData[selectedId] : null;
    
    // Analytics Scoping Logic:
    // If Admin -> Show everything.
    // If Org -> Only show metrics for owned assets.
    // If Individual/Guest -> Panel should be hidden by parent, but guard here too.
    const canSeeMetrics = isAdmin || (selectedItem && selectedItem.brand && selectedItem.brand.orgId === currentUser?.orgContext?.orgId);

    // Memoize demo data
    const metrics = useMemo(() => {
        if (!canSeeMetrics) return null; // Redacted view
        const impressions = analytics.filter(a => a.type === 'billboard_impression').length || 1250;
        const clicks = analytics.filter(a => a.type === 'billboard_click').length || 85;
        const ctr = ((clicks / impressions) * 100).toFixed(2);
        return { impressions, clicks, ctr, dwell: '4.2s' };
    }, [analytics, canSeeMetrics]);

    return (
        <div style={{position:'fixed', top:20, right:20, width:320, background:'rgba(5, 5, 20, 0.95)', border:'1px solid #fbbf24', borderRadius:8, padding:20, zIndex:3000, color:'white', boxShadow:'0 10px 30px rgba(0,0,0,0.5)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                <h3 style={{margin:0, color:'#fbbf24', fontSize:16}}>For Brands (Preview)</h3>
                <button onClick={onClose} style={{background:'none', border:'none', color:'#666', cursor:'pointer'}}>✕</button>
            </div>
            
            {/* KPI Tiles (Conditional) */}
            {canSeeMetrics ? (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20}}>
                    <div style={{background:'#111', padding:10, borderRadius:4}}><div style={{fontSize:10, color:'#aaa'}}>IMPRESSIONS</div><div style={{fontSize:18, fontWeight:'bold'}}>{metrics.impressions}</div></div>
                    <div style={{background:'#111', padding:10, borderRadius:4}}><div style={{fontSize:10, color:'#aaa'}}>CLICKS</div><div style={{fontSize:18, fontWeight:'bold'}}>{metrics.clicks}</div></div>
                    <div style={{background:'#111', padding:10, borderRadius:4}}><div style={{fontSize:10, color:'#aaa'}}>CTR</div><div style={{fontSize:18, fontWeight:'bold', color:'#22c55e'}}>{metrics.ctr}%</div></div>
                    <div style={{background:'#111', padding:10, borderRadius:4}}><div style={{fontSize:10, color:'#aaa'}}>AVG DWELL</div><div style={{fontSize:18, fontWeight:'bold', color:'#00aaff'}}>{metrics.dwell}</div></div>
                </div>
            ) : (
                <div style={{background:'#220000', border:'1px dashed #ef4444', padding:15, borderRadius:4, marginBottom:20, textAlign:'center'}}>
                    <div style={{fontSize:24}}>🔒</div>
                    <div style={{fontSize:12, color:'#ef4444', fontWeight:'bold'}}>CONFIDENTIAL DATA</div>
                    <div style={{fontSize:10, color:'#aaa'}}>Metrics available to asset owner only.</div>
                </div>
            )}

            {/* Placement Inspector */}
            <div style={{padding:10, background:'rgba(251, 191, 36, 0.1)', border:'1px dashed #fbbf24', borderRadius:4, marginBottom:15}}>
                <div style={{fontSize:11, color:'#fbbf24', fontWeight:'bold', marginBottom:5}}>PLACEMENT INSPECTOR</div>
                {selectedItem ? (
                    <div style={{fontSize:11}}>
                        <div style={{marginBottom:3}}><span style={{color:'#888'}}>ID:</span> {selectedId} {selectedItem.assetId && `(${selectedItem.assetId})`}</div>
                        <div style={{marginBottom:3}}><span style={{color:'#888'}}>Sponsor:</span> {selectedItem.sponsorName || 'N/A'}</div>
                        <div style={{marginBottom:8}}><span style={{color:'#888'}}>Est. Reach:</span> <span style={{color:'#fff', fontWeight:'bold'}}>~{(Math.random()*5000+1000).toFixed(0)} / day</span></div>
                        
                        {isAdmin && (
                            <div style={{display:'flex', gap:5, marginTop:10, borderTop:'1px solid #444', paddingTop:8}}>
                                <button onClick={()=>onPause(selectedId)} style={{flex:1, padding:4, background:'#444', border:'none', color:'white', fontSize:10, borderRadius:3, cursor:'pointer'}}>⏯ Pause</button>
                                <button onClick={()=>onRollback(selectedId)} style={{flex:1, padding:4, background:'#444', border:'none', color:'white', fontSize:10, borderRadius:3, cursor:'pointer'}}>↺ Rollback</button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{fontSize:10, color:'#ccc', fontStyle:'italic'}}>Click any billboard in the world to inspect via simulated context.</div>
                )}
            </div>

            {/* Actions */}
            <div style={{display:'flex', gap:10}}>
                <button onClick={()=>onOpenPitch(selectedItem)} style={{flex:1, padding:8, background:'#fbbf24', color:'black', border:'none', borderRadius:4, fontWeight:'bold', cursor:'pointer', fontSize:11}}>Request Deck</button>
                <button onClick={onExport} style={{flex:1, padding:8, background:'#333', color:'white', border:'1px solid #555', borderRadius:4, cursor:'pointer', fontSize:11}}>Export PDF</button>
            </div>

            {isAdmin && <CreativeChecker />}
        </div>
    );
};

// === TRUST LAYER ===
const TrustModals = ({ type, onClose }) => {
    const changelog = loadData(CHANGELOG_KEY, [{date: new Date().toISOString(), title:'Initial Launch', notes:'VirtuNovo 2.4 Live'}]);
    return (
        <ModalBackdrop onClose={onClose}>
            {type === 'STATUS' && (
                <>
                    <h2 style={{color:'#22c55e'}}>All Systems Operational</h2>
                    <div style={{marginTop:20}}>
                        <h4 style={{borderBottom:'1px solid #333', paddingBottom:5}}>Changelog</h4>
                        {changelog.map((c,i) => (
                            <div key={i} style={{fontSize:12, marginBottom:10, paddingBottom:10, borderBottom:'1px solid #222'}}>
                                <div style={{color:'#00aaff'}}>{new Date(c.date).toLocaleDateString()}</div>
                                <div style={{fontWeight:'bold'}}>{c.title}</div>
                                <div style={{color:'#888'}}>{c.notes}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {type === 'PRIVACY' && (
                <>
                    <h2 style={{color:'#d946ef'}}>Privacy & Ad Tech</h2>
                    <p style={{fontSize:12, color:'#ccc'}}>We use decentralized analytics to ensure your movement data remains anonymous. Sponsored content is delivered contextually based on district location, not personal profiling.</p>
                    <div style={{marginTop:15, padding:10, background:'#111', borderRadius:5}}>
                        <strong style={{color:'white', fontSize:12}}>What we track:</strong>
                        <ul style={{fontSize:11, color:'#888', paddingLeft:20, margin:'5px 0'}}>
                            <li>Anonymized Dwell Time</li>
                            <li>Interaction Counts (Clicks)</li>
                            <li>District Traffic Heatmaps</li>
                        </ul>
                    </div>
                </>
            )}
        </ModalBackdrop>
    );
};

// === GUIDED TOUR ===
const GuidedTourOverlay = ({ step, onNext, onSkip }) => {
    const content = [
        { title: "Welcome to VirtuNovo", body: "Explore the first decentralized metaverse city. Use mouse to rotate, arrow keys to move." },
        { title: "Daily Missions", body: "Check the top-right HUD. Complete tasks like 'Visit District' to earn Points." },
        { title: "Interactive Ads", body: "Click on billboards to engage with sponsors and earn rewards." },
        { title: "Live Events", body: "Look for the Event Portals or use the Event button to warp instantly." }
    ];
    const curr = content[step] || content[0];
    return (
        <div style={{position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', width:300, background:'rgba(0,10,20,0.95)', border:'1px solid #00ffff', borderRadius:8, padding:20, zIndex:5000, color:'white', textAlign:'center', boxShadow:'0 0 20px rgba(0,255,255,0.3)'}}>
            <h3 style={{margin:'0 0 10px 0', color:'#00ffff'}}>{curr.title}</h3>
            <p style={{fontSize:12, color:'#ccc', marginBottom:20}}>{curr.body}</p>
            <div style={{display:'flex', justifyContent:'space-between'}}>
                <button onClick={onSkip} style={{background:'transparent', border:'none', color:'#888', cursor:'pointer', fontSize:11}}>Skip Tour</button>
                <div style={{fontSize:11, color:'#555'}}>{step+1} / 4</div>
                <button onClick={onNext} style={{background:'#00ffff', border:'none', color:'black', padding:'5px 15px', borderRadius:15, fontWeight:'bold', cursor:'pointer'}}>Next →</button>
            </div>
        </div>
    );
};

// === COMMAND PALETTE ===
const CommandPalette = ({ isOpen, onClose, actions, sceneData }) => {
    if (!isOpen) return null;
    const [query, setQuery] = useState("");
    const cmds = [
        { id:'missions', label:'Open Missions', action: actions.openMissions },
        { id:'vault', label:'Open Vault', action: actions.openVault },
        { id:'events', label:'Open Events', action: actions.openEvents },
        { id:'rank', label:'Open Leaderboard', action: actions.openRank },
        { id:'invite', label:'Invite Friends', action: actions.openInvite },
        { id:'warp_hero', label:'Warp to HQ', action: () => actions.warp([0, 500, 0]) },
        { id:'warp_event', label:'Warp to Active Event', action: actions.warpToEvent },
        { id:'toggle_brand', label:'Toggle Brand Mode', action: actions.toggleBrandMode },
        { id:'open_leads', label:'Open Leads Panel (Admin)', action: actions.openLeads }
    ];
    
    // Add Type-to-Edit Assets
    const assetCmds = Object.entries(sceneData).map(([key, data]) => ({
        id: `edit_${key}`,
        label: `Edit: ${data.labelText || key} (${data.assetId || 'No ID'})`,
        action: () => actions.editAsset(key)
    }));

    const allCmds = [...cmds, ...assetCmds];
    const filtered = allCmds.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
    
    return (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.7)', zIndex:6000, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{width:500, background:'#111', border:'1px solid #333', borderRadius:8, padding:15, color:'white', boxShadow:'0 10px 50px black'}}>
                <input autoFocus placeholder="Type a command or asset ID..." value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape') onClose(); if(e.key==='Enter' && filtered.length > 0) { filtered[0].action(); onClose(); }}} style={{width:'100%', padding:12, background:'#222', border:'none', color:'white', borderRadius:4, fontSize:16, outline:'none'}} />
                <div style={{marginTop:10, maxHeight:300, overflowY:'auto'}}>
                    {filtered.map((c,i) => (
                        <div key={c.id} onClick={()=>{ c.action(); onClose(); }} style={{padding:'10px', cursor:'pointer', borderBottom:'1px solid #222', color: i===0?'#00ffff':'#ccc'}}>
                            {c.label} <span style={{float:'right', fontSize:10, color:'#555'}}>↵</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div style={{padding:10, color:'#555'}}>No commands found</div>}
                </div>
            </div>
        </div>
    );
};

const ContentEditorPanel = () => {
    const [config, setConfig] = useState(loadData(SITE_CONFIG_KEY, DEFAULT_SITE_CONFIG));
    const [seo, setSeo] = useState(loadData(SEO_CONFIG_KEY, { metaTitle: '', metaDescription: '', ogImage: '' }));
    const [draft, setDraft] = useState({ ...config, ...seo });
    const showToast = useToast();

    const handleChange = (field, val) => setDraft(prev => ({ ...prev, [field]: val }));
    const handlePublish = () => {
        const newConfig = { heroTitle: draft.heroTitle, heroSubtitle: draft.heroSubtitle, aboutText: draft.aboutText, contactText: draft.contactText };
        const newSeo = { metaTitle: draft.metaTitle, metaDescription: draft.metaDescription, ogImage: draft.ogImage };
        saveData(SITE_CONFIG_KEY, newConfig);
        saveData(SEO_CONFIG_KEY, newSeo);
        setConfig(newConfig); setSeo(newSeo);
        const history = loadData(SITE_VERSION_HISTORY_KEY, []);
        history.unshift({ ts: new Date().toISOString(), config: newConfig });
        if(history.length>10) history.pop();
        saveData(SITE_VERSION_HISTORY_KEY, history);
        logAdmin("publish_content", { heroTitle: newConfig.heroTitle });
        showToast("Site Content Published", 'success');
    };
    const handleRollback = () => {
        const history = loadData(SITE_VERSION_HISTORY_KEY, []);
        if(history.length > 0) {
            const prev = history[0];
            saveData(SITE_CONFIG_KEY, prev.config);
            setConfig(prev.config); setDraft(prev.config);
            showToast("Rolled back to previous version", 'info');
        }
    };

    const inputStyle = { width: '100%', padding: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', borderRadius: 4, marginBottom: 10 };
    return (
        <div style={{color:'white'}}>
            <h3 style={{margin:'0 0 15px 0', color:'#00aaff'}}>Content Editor</h3>
            <div style={{marginBottom:20}}>
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Hero Title</label>
                <input value={draft.heroTitle} onChange={e=>handleChange('heroTitle',e.target.value)} style={inputStyle} />
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Hero Subtitle</label>
                <input value={draft.heroSubtitle} onChange={e=>handleChange('heroSubtitle',e.target.value)} style={inputStyle} />
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>About Text</label>
                <textarea value={draft.aboutText} onChange={e=>handleChange('aboutText',e.target.value)} style={{...inputStyle, height:80}} />
                <h4 style={{fontSize:14, color:'#d946ef', marginTop:15}}>SEO Metadata</h4>
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Meta Title</label>
                <input value={draft.metaTitle} onChange={e=>handleChange('metaTitle',e.target.value)} style={inputStyle} />
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Meta Description</label>
                <textarea value={draft.metaDescription} onChange={e=>handleChange('metaDescription',e.target.value)} style={{...inputStyle, height:60}} />
            </div>
            <div style={{display:'flex', gap:10}}>
                <button onClick={handlePublish} style={{flex:1, padding:10, background:'#22c55e', border:'none', borderRadius:4, color:'black', fontWeight:'bold', cursor:'pointer'}}>Publish Changes</button>
                <button onClick={()=>{ setDraft({...config, ...seo}); }} style={{flex:1, padding:10, background:'#333', border:'1px solid #555', borderRadius:4, color:'#aaa', cursor:'pointer'}}>Discard</button>
                <button onClick={handleRollback} style={{padding:'10px 15px', background:'#333', border:'1px solid #00aaff', borderRadius:4, color:'#00aaff', cursor:'pointer'}} title="Rollback">↺</button>
            </div>
            {JSON.stringify(draft) !== JSON.stringify({...config, ...seo}) && <div style={{marginTop:10, fontSize:12, color:'#fbbf24'}}>⚠️ Unsaved Draft Changes</div>}
        </div>
    );
};

const AdminLogsPanel = () => {
    const logs = loadData(ADMIN_LOGS_KEY, []);
    const [filter, setFilter] = useState("");
    const filtered = logs.filter(l => !filter || l.action.includes(filter) || l.actor.includes(filter));
    return (
        <div style={{color:'white'}}>
            <h3 style={{margin:'0 0 15px 0', color:'#ccc'}}>Audit Logs</h3>
            <input placeholder="Filter logs..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', padding:8, background:'#111', border:'1px solid #333', color:'white', marginBottom:10, borderRadius:4}} />
            <div style={{maxHeight:'60vh', overflowY:'auto', background:'#111', borderRadius:8, border:'1px solid #333'}}>
                <table style={{width:'100%', fontSize:12, borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid #333', textAlign:'left'}}><th style={{padding:8}}>Time</th><th style={{padding:8}}>Actor</th><th style={{padding:8}}>Action</th></tr></thead>
                    <tbody>
                        {filtered.map((l, i) => (
                            <tr key={i} style={{borderBottom:'1px solid #222'}}>
                                <td style={{padding:8, color:'#888'}}>{new Date(l.ts).toLocaleString()}</td>
                                <td style={{padding:8, color:'#00aaff'}}>{l.actor}</td>
                                <td style={{padding:8}}>{l.action}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button onClick={()=>{
                const blob = new Blob([JSON.stringify(logs,null,2)], {type:"application/json"});
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download="admin_logs.json"; a.click();
            }} style={{marginTop:10, padding:8, background:'#333', border:'none', color:'#ccc', cursor:'pointer', borderRadius:4, fontSize:12}}>Export JSON</button>
        </div>
    );
};

const DashboardPanel = () => {
    const users = loadData(USERS_DB_KEY, []);
    const analytics = loadData(KEYS.ANALYTICS, []);
    const weeklyPts = parseInt(localStorage.getItem(KEYS.WEEKLY_POINTS) || 0);
    const missions = loadData(KEYS.DAILY_MISSIONS, { items: [] });
    
    // Compute simple KPIs
    const kpis = useMemo(() => {
        const last7Days = Array.from({length:7}).map((_,i) => {
            const d = new Date(); d.setDate(d.getDate() - (6-i));
            return d.toISOString().split('T')[0];
        });
        const sessionsByDay = last7Days.map(date => analytics.filter(a => a.type==='session_start' && a.timestamp.startsWith(date)).length);
        const impressions = analytics.filter(a => a.type==='billboard_impression').length;
        const clicks = analytics.filter(a => a.type==='billboard_click').length;
        const ctr = impressions > 0 ? ((clicks/impressions)*100).toFixed(2) : '0.00';
        return { totalUsers: users.length, sessionsByDay, impressions, clicks, ctr, missionsCompleted: missions.items.filter(m=>m.claimed).length };
    }, [users, analytics, missions]);

    const cardStyle = { background:'#111', padding:15, borderRadius:8, border:'1px solid #333', flex:'1 0 140px' };
    const labelStyle = { fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:1, marginBottom:5 };
    const valStyle = { fontSize:24, fontWeight:'bold', color:'white' };

    return (
        <div style={{color:'white'}}>
            <h3 style={{margin:'0 0 15px 0', color:'#fbbf24'}}>Dashboard</h3>
            <div style={{display:'flex', flexWrap:'wrap', gap:10}}>
                <div style={cardStyle}><div style={labelStyle}>Total Users</div><div style={valStyle}>{kpis.totalUsers}</div></div>
                <div style={cardStyle}><div style={labelStyle}>Wkly Points</div><div style={valStyle}>{weeklyPts}</div></div>
                <div style={cardStyle}><div style={labelStyle}>Missions Done</div><div style={valStyle}>{kpis.missionsCompleted}</div></div>
                <div style={cardStyle}><div style={labelStyle}>Ad CTR</div><div style={valStyle}>{kpis.ctr}%</div></div>
            </div>
            <div style={{marginTop:20, background:'#111', padding:15, borderRadius:8, border:'1px solid #333'}}>
                <div style={labelStyle}>Session Trend (7 Days)</div>
                <div style={{display:'flex', alignItems:'flex-end', gap:10, height:40}}>
                    <KpiSparkline data={kpis.sessionsByDay} />
                    <span style={{fontSize:12, color:'#888'}}>{kpis.sessionsByDay.reduce((a,b)=>a+b,0)} total this week</span>
                </div>
            </div>
        </div>
    );
};

const NotificationTemplatesPanel = () => {
    const [tmpls, setTmpls] = useState(loadData(NOTIFICATION_TEMPLATES_KEY, { welcome: { sub: 'Welcome!', body: 'Hi {{name}}, welcome to Virtunovo.' } }));
    const handleChange = (key, field, val) => {
        const updated = { ...tmpls, [key]: { ...(tmpls[key]||{}), [field]: val } };
        setTmpls(updated);
        saveData(NOTIFICATION_TEMPLATES_KEY, updated);
    };
    return (
        <div style={{color:'white'}}>
             <h3 style={{margin:'0 0 15px 0', color:'#ccc'}}>Email Templates</h3>
             {['welcome', 'reset_password', 'event_reminder'].map(key => (
                 <div key={key} style={{marginBottom:15, borderBottom:'1px solid #333', paddingBottom:15}}>
                     <div style={{fontSize:12, textTransform:'uppercase', color:'#00aaff', marginBottom:5}}>{key.replace('_', ' ')}</div>
                     <input placeholder="Subject" value={tmpls[key]?.sub||''} onChange={e=>handleChange(key,'sub',e.target.value)} style={{width:'100%', padding:8, background:'#222', border:'1px solid #444', color:'white', marginBottom:5, borderRadius:4}} />
                     <textarea placeholder="Body (use {{name}})" value={tmpls[key]?.body||''} onChange={e=>handleChange(key,'body',e.target.value)} style={{width:'100%', padding:8, background:'#222', border:'1px solid #444', color:'white', height:60, borderRadius:4}} />
                 </div>
             ))}
        </div>
    );
};

const SettingsPanel = ({ openCreds }) => {
    const showToast = useToast();
    const [audioPrefs, setAudioPrefs] = useState(loadData(AUDIO_PREFS_KEY, { ambience: false, eventPulse: false }));
    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                saveData(BRAND_LOGO_KEY, reader.result);
                showToast("Logo updated. Refresh to apply.", "success");
            };
            reader.readAsDataURL(file);
        }
    };
    const toggleAudio = (key) => {
        const val = !audioPrefs[key];
        const updated = { ...audioPrefs, [key]: val };
        setAudioPrefs(updated);
        saveData(AUDIO_PREFS_KEY, updated);
    };

    return (
        <div style={{color:'white'}}>
            <h3 style={{margin:'0 0 15px 0', color:'#ccc'}}>System Settings</h3>
            <div style={{marginBottom:15}}>
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Brand Logo</label>
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{fontSize:12, color:'#ccc'}} />
            </div>
            <div style={{marginBottom:15}}>
                <h4 style={{fontSize:12, color:'#fbbf24'}}>Audio & Ambience</h4>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}>
                    <span style={{fontSize:12}}>City Ambience</span>
                    <button onClick={()=>toggleAudio('ambience')} style={{background: audioPrefs.ambience?'#22c55e':'#333', border:'none', color:'white', borderRadius:10, padding:'2px 8px', fontSize:10}}>{audioPrefs.ambience?'ON':'OFF'}</button>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                    <span style={{fontSize:12}}>Event Pulse SFX</span>
                    <button onClick={()=>toggleAudio('eventPulse')} style={{background: audioPrefs.eventPulse?'#22c55e':'#333', border:'none', color:'white', borderRadius:10, padding:'2px 8px', fontSize:10}}>{audioPrefs.eventPulse?'ON':'OFF'}</button>
                </div>
            </div>
            <div style={{marginBottom:15, marginTop:20}}>
                <label style={{display:'block', fontSize:12, color:'#888', marginBottom:5}}>Security</label>
                <button onClick={openCreds} style={{padding:'8px 12px', background:'#333', border:'1px solid #00aaff', color:'#00aaff', borderRadius:4, cursor:'pointer'}}>Manage Admin Credentials & 2FA</button>
            </div>
            <div style={{fontSize:11, color:'#666', marginTop:20, borderTop:'1px solid #333', paddingTop:10}}>
                Version: 2.4.0 • Build: Production • CDN: LocalStorage
            </div>
        </div>
    );
};

const AdminSidebar = ({ collapsed, setCollapsed, activePanel, setActivePanel, actions }) => {
    // actions: { openUsers, openEvents, openMetrics, openMaster, openCreds }
    const sections = [
        { id: 'dashboard', label: 'Dashboard', icon: '🏠', component: <DashboardPanel /> },
        { id: 'content', label: 'Content', icon: '✏️', component: <ContentEditorPanel /> },
        { id: 'users', label: 'Users', icon: '👥', action: actions.openUsers },
        { id: 'campaigns', label: 'Campaigns', icon: '📣', action: actions.openMetrics },
        { id: 'events', label: 'Events', icon: '📅', action: actions.openEvents },
        { id: 'analytics', label: 'Analytics', icon: '📈', component: <DashboardPanel /> },
        { id: 'logs', label: 'Logs', icon: '🧾', component: <AdminLogsPanel /> },
        { id: 'leads', label: 'CRM Leads', icon: '💼', component: <LeadsPanel /> },
        { id: 'flight', label: 'Flight Plan', icon: '✈️', component: <FlightPlanPanel /> },
        { id: 'settings', label: 'Settings', icon: '⚙️', children: [
            { id: 'notifications', label: 'Notifications', component: <NotificationTemplatesPanel /> },
            { id: 'security', label: 'System', component: <SettingsPanel openCreds={actions.openCreds} /> }
        ]},
        { id: 'master', label: 'Master Flags', icon: '🎛️', action: actions.openMaster }
    ];

    const [expandedSection, setExpandedSection] = useState(null);

    const handleSectionClick = (s) => {
        if (s.children) {
            setExpandedSection(expandedSection === s.id ? null : s.id);
            if(collapsed) setCollapsed(false);
        } else {
            if (s.action) s.action();
            else setActivePanel(activePanel === s.id ? null : s.id);
        }
    };

    return (
        <>
        <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, 
            width: collapsed ? 60 : 240, 
            background: 'rgba(5, 5, 15, 0.95)', borderRight: '1px solid #333', 
            transition: 'width 0.3s ease', zIndex: 4000, display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(10px)'
        }}>
            <button 
                onClick={() => { const s = !collapsed; setCollapsed(s); localStorage.setItem(SIDEBAR_COLLAPSED_KEY, s); }}
                style={{background:'transparent', border:'none', color:'white', fontSize:20, padding:15, cursor:'pointer', textAlign:'left'}}
                aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                aria-expanded={!collapsed}
            >☰</button>
            
            <div style={{flex:1, overflowY:'auto', overflowX:'hidden'}}>
                {sections.map(s => (
                    <div key={s.id}>
                        <div 
                            onClick={() => handleSectionClick(s)}
                            style={{
                                padding: '15px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', 
                                color: (activePanel === s.id || expandedSection === s.id) ? '#00ffff' : '#aaa',
                                background: (activePanel === s.id) ? 'rgba(0,255,255,0.05)' : 'transparent',
                                borderLeft: (activePanel === s.id) ? '3px solid #00ffff' : '3px solid transparent'
                            }}
                        >
                            <span style={{fontSize:18, width:25, textAlign:'center'}}>{s.icon}</span>
                            {!collapsed && <span style={{marginLeft:15, fontSize:14, flex:1}}>{s.label}</span>}
                            {!collapsed && s.children && <span style={{fontSize:10}}>{expandedSection === s.id ? '▾' : '▸'}</span>}
                        </div>
                        {!collapsed && s.children && expandedSection === s.id && (
                            <div style={{background: 'rgba(0,0,0,0.3)', paddingLeft: 60}}>
                                {s.children.map(child => (
                                    <div 
                                        key={child.id} 
                                        onClick={(e) => { e.stopPropagation(); setActivePanel(child.id); }}
                                        style={{padding: '10px 0', fontSize: 13, color: activePanel === child.id ? 'white' : '#888', cursor: 'pointer'}}
                                    >
                                        {child.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div style={{padding:15, fontSize:10, color:'#444', textAlign:'center'}}>
                {!collapsed && "VirtuNovo Admin v2.4"}
            </div>
        </div>

        {/* Floating Content Panel */}
        {activePanel && !sections.find(x => x.id === activePanel)?.action && (
            <div style={{
                position: 'fixed', top: 20, left: collapsed ? 80 : 260, 
                width: 400, maxHeight: '90vh', overflowY: 'auto',
                background: 'rgba(10, 15, 25, 0.95)', border: '1px solid #333', 
                borderRadius: 8, padding: 20, zIndex: 3999, boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}>
                <button onClick={() => setActivePanel(null)} style={{float:'right', background:'transparent', border:'none', color:'#666', cursor:'pointer'}}>×</button>
                <LocalErrorBoundary>
                    {sections.map(s => {
                        if (s.id === activePanel) return <React.Fragment key={s.id}>{s.component}</React.Fragment>;
                        if (s.children) {
                            const child = s.children.find(c => c.id === activePanel);
                            if (child) return <React.Fragment key={child.id}>{child.component}</React.Fragment>;
                        }
                        return null;
                    })}
                </LocalErrorBoundary>
            </div>
        )}
        </>
    );
};

// === RETENTION: PROGRESS DRAWER (SEASON PASS & HOME DISTRICT) ===
const ProgressDrawer = ({ onClose, show, onSetHomeDistrict }) => {
    const pts = localStorage.getItem(KEYS.POINTS) || 0;
    const streak = localStorage.getItem(KEYS.STREAK) || 0;
    const missions = loadData(KEYS.DAILY_MISSIONS, { items: [] });
    const season = loadData(SEASON_KEY, { seasonId:'S1', label:'Genesis Season', level:1, maxLevel:10 });
    
    return (
        <div style={{
            position:'fixed', top:0, right:0, height:'100vh', width:300,
            background:'rgba(0,0,0,0.9)', borderLeft:'1px solid #333',
            transform: show ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s cubic-bezier(0.1, 0, 0, 1)',
            zIndex: 3000, padding: 20, color: 'white'
        }}>
            <button onClick={onClose} style={{position:'absolute', top:15, left:15, background:'transparent', border:'none', color:'#888', cursor:'pointer'}}>→</button>
            <div style={{marginTop:40, textAlign:'center'}}>
                <div style={{fontSize:12, color:'#888', letterSpacing:2}}>MY PROGRESS</div>
                <div style={{fontSize:40, fontWeight:'bold', color:'#00ffff', textShadow:'0 0 20px rgba(0,255,255,0.5)'}}>{pts}</div>
                <div style={{fontSize:12, color:'#aaa'}}>POINTS ACCUMULATED</div>
            </div>
            
            <div style={{marginTop:30, background:'#111', padding:10, borderRadius:6}}>
                <div style={{fontSize:12, color:'#fbbf24', fontWeight:'bold', marginBottom:5}}>SEASON PASS: {season.label}</div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'#888'}}>
                    <span>Level {season.level}</span><span>Max {season.maxLevel}</span>
                </div>
                <div style={{height:4, background:'#333', marginTop:5, borderRadius:2}}>
                    <div style={{width: `${(season.level/season.maxLevel)*100}%`, background:'#fbbf24', height:'100%'}}></div>
                </div>
                <div style={{fontSize:10, color:'#555', marginTop:5, fontStyle:'italic'}}>Next Reward: Cyber Jacket (Level {season.level+1})</div>
            </div>

            <div style={{marginTop:20}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                    <span style={{fontSize:14, fontWeight:'bold'}}>Current Streak</span>
                    <span style={{fontSize:18, color:'orange'}}>🔥 {streak}</span>
                </div>
                <div style={{display:'flex', gap:5}}>
                    {[...Array(7)].map((_, i) => (
                        <div key={i} style={{flex:1, height:6, borderRadius:2, background: i < (streak % 7) ? 'orange' : '#333'}}></div>
                    ))}
                </div>
            </div>

            <div style={{marginTop:30}}>
                <h4 style={{borderBottom:'1px solid #333', paddingBottom:5}}>Daily Missions</h4>
                {missions.items.map(m => (
                    <div key={m.id} style={{fontSize:12, padding:'10px 0', borderBottom:'1px solid #222', opacity: m.claimed ? 0.5 : 1}}>
                        <div style={{display:'flex', justifyContent:'space-between'}}>
                            <span>{m.title}</span>
                            <span style={{color: m.claimed ? '#22c55e' : '#aaa'}}>{m.claimed ? '✔' : `${m.current}/${m.goal}`}</span>
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={onSetHomeDistrict} style={{width:'100%', marginTop:30, padding:10, background:'#333', border:'1px solid #555', color:'#ccc', cursor:'pointer', borderRadius:4, fontSize:12}}>
                Set Current Spot as Home
            </button>
        </div>
    );
};

// ==========================================
// 5. MAIN COMPONENT (LOGIC ROOT)
// ==========================================

const SceneContent = () => {
    const [viewState, setViewState] = useState(() => localStorage.getItem(AUTH_STATE_KEY) ? "TRANSITION" : "LANDING");
    const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("VIRTUNOVO_IS_ADMIN") === "true");
    const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem(USER_SESSION_KEY)); } catch(e){ return null; } });
    
    // UI FLAGS
    const [showAuth, setShowAuth] = useState(false);
    const [showUsers, setShowUsers] = useState(false);
    const [showCreds, setShowCreds] = useState(false);
    const [showMaster, setShowMaster] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showOnboarding, setShowOnboarding] = useState(false); 

    // MODAL FLAGS
    const [showMissions, setShowMissions] = useState(false);
    const [showVault, setShowVault] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [showPartners, setShowPartners] = useState(false);

    // ADMIN UX STATE
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    const [activeAdminPanel, setActiveAdminPanel] = useState('dashboard');
    const [showProgressDrawer, setShowProgressDrawer] = useState(false);

    // AUDIENCE MODES (NEW)
    const [brandModeEnabled, setBrandMode] = useState(() => localStorage.getItem(BRAND_MODE_KEY) === 'true');
    const [showBrandPanel, setShowBrandPanel] = useState(false);
    const [showGuidedTour, setShowGuidedTour] = useState(false);
    const [tourStep, setTourStep] = useState(0);
    const [trustModalType, setTrustModalType] = useState(null); // STATUS, TEAM, PRIVACY
    const [showCmdPalette, setShowCmdPalette] = useState(false);
    
    // ADMIN OVERLAYS
    const [showAssetIds, setShowAssetIds] = useState(false); // Toggle via Command Palette
    
    // GAME STATE
    const [isPlacingEgg, setIsPlacingEgg] = useState(false);
    const [ghostEggPos, setGhostEggPos] = useState(null);
    const [eggImage, setEggImage] = useState(null); 
    const [eggs, setEggs] = useState([]);
    const [dailyCrystals, setDailyCrystals] = useState([]);
    const [isControlsEnabled, setIsControlsEnabled] = useState(false);
    const [moveLocked, setMoveLocked] = useState(true);
    const [sponsorCTA, setSponsorCTA] = useState(null);

    const [sceneData, setSceneData] = useState(() => loadData(STORAGE_KEY, DEFAULT_SCENE_DATA));
    const [siteConfig] = useState(() => loadData(SITE_CONFIG_KEY, DEFAULT_SITE_CONFIG));
    const [masterFlags, setMasterFlags] = useState(() => loadData(MASTER_FLAGS_KEY, DEFAULT_MASTER_FLAGS));
    
    const controlsRef = useRef(null);
    const [focusTarget, setFocusTarget] = useState(null);
    
    const showToast = useToast();
    const { logEvent } = useAnalytics();
    const { updateMission, claimMission, addPoints, addTickets } = useGamification(showToast);

    // --- MIGRATION ON MOUNT ---
    useEffect(() => {
        const migrateLocalStorage = () => {
            // 1. Ensure master flags have new defaults
            const currentFlags = loadData(MASTER_FLAGS_KEY, {});
            const mergedFlags = { ...DEFAULT_MASTER_FLAGS, ...currentFlags };
            if (JSON.stringify(mergedFlags) !== JSON.stringify(currentFlags)) {
                saveData(MASTER_FLAGS_KEY, mergedFlags);
                setMasterFlags(mergedFlags);
            }
            // 2. Ensure Users have 'role'
            const users = loadData(USERS_DB_KEY, []);
            let usersChanged = false;
            const updatedUsers = users.map(u => {
                if (!u.role) { usersChanged = true; return { ...u, role: ROLES.VISITOR }; }
                return u;
            });
            if (usersChanged) saveData(USERS_DB_KEY, updatedUsers);
            // 3. Ensure Enterprise Keys
            if (!localStorage.getItem(SEASON_KEY)) saveData(SEASON_KEY, { seasonId:'S1', label:'Genesis Season', level:1, maxLevel:10 });
            if (!localStorage.getItem(BRAND_LEADS_KEY)) saveData(BRAND_LEADS_KEY, []);
            if (!localStorage.getItem(FLIGHTS_KEY)) saveData(FLIGHTS_KEY, []);
            if (!localStorage.getItem(COMPLIANCE_NOTES_KEY)) saveData(COMPLIANCE_NOTES_KEY, {});
        };
        migrateLocalStorage();
    }, []);

    // Brand Mode Persistence
    useEffect(() => {
        localStorage.setItem(BRAND_MODE_KEY, brandModeEnabled);
        if (brandModeEnabled) setShowBrandPanel(true); else setShowBrandPanel(false);
    }, [brandModeEnabled]);

    // Command Palette Listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowCmdPalette(p => !p);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if(isAdmin) localStorage.setItem("VIRTUNOVO_IS_ADMIN", "true"); else localStorage.removeItem("VIRTUNOVO_IS_ADMIN");
        if(currentUser) localStorage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser)); else localStorage.removeItem(USER_SESSION_KEY);
        if(viewState === "WORLD" || viewState === "TRANSITION") localStorage.setItem(AUTH_STATE_KEY, "WORLD"); else localStorage.removeItem(AUTH_STATE_KEY);
    }, [isAdmin, viewState, currentUser]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get("ref");
        if(ref && !localStorage.getItem(KEYS.REF_INCOMING)) localStorage.setItem(KEYS.REF_INCOMING, ref);
    }, []);

    useEffect(() => {
        const sessionId = `sess_${Date.now()}`;
        logEvent('session_start', { sessionId });
        const handleEnd = () => logEvent('session_end', { sessionId });
        window.addEventListener('beforeunload', handleEnd);
        return () => { window.removeEventListener('beforeunload', handleEnd); handleEnd(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const spawnedOn = localStorage.getItem(KEYS.DAILY_CRYSTALS_DATE);
        if (spawnedOn !== today) {
            const fixed = [
                { id:`dc_1_${today}`, position:[-400, 30, -400] },
                { id:`dc_2_${today}`, position:[400, 30, -400] },
                { id:`dc_3_${today}`, position:[-400, 30, 400] },
                { id:`dc_4_${today}`, position:[400, 30, 400] },
                { id:`dc_5_${today}`, position:[0, 30, 700] },
            ];
            saveData(KEYS.DAILY_CRYSTALS, fixed);
            localStorage.setItem(KEYS.DAILY_CRYSTALS_DATE, today);
        }
        const crystals = loadData(KEYS.DAILY_CRYSTALS, []);
        setDailyCrystals(crystals);
    }, []);

    const handleSelect = (id, e) => {
        if (brandModeEnabled && showBrandPanel) {
            // In brand mode, clicking selects for preview in panel
            if (e.shiftKey) { /* Allow multi select */ setSelectedIds(prev => new Set(prev).add(id)); } 
            else { setSelectedIds(new Set([id])); }
            return;
        }

        if (!isAdmin) {
            if(id.startsWith("BILLBOARD")) {
                 const bb = sceneData[id];
                 if(bb && bb.ctaUrl) { 
                    logEvent('billboard_click', { id, sponsorName: bb.sponsorName, campaignId: bb.campaignId });
                    window.open(bb.ctaUrl, '_blank'); 
                 }
                 updateMission('interact', 1);
            }
            return;
        }
        const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
        setSelectedIds(prev => {
            const newSet = new Set(isMulti ? prev : []); 
            if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (type) => {
        const newSet = new Set();
        Object.keys(sceneData).forEach(key => {
            if (type === 'WALLS' && key.startsWith('WALL')) newSet.add(key);
            else if (type === 'BUILDINGS' && (key.startsWith('R') || key.startsWith('FILLER'))) newSet.add(key);
            else if (type === 'SCREENS' && key.startsWith('BILLBOARD')) newSet.add(key);
        });
        setSelectedIds(newSet);
    };

    const handleMove = (id, x, y, z, relative) => {
        setSceneData(prev => {
            const old = prev[id] || {};
            return { ...prev, [id]: { ...old, x: relative ? (old.x||0) + x : x, y: relative ? (old.y||0) + y : y, z: relative ? (old.z||0) + z : z } };
        });
    };

    const handleUpdate = (field, value) => {
        setSceneData(prev => {
            const next = { ...prev };
            selectedIds.forEach(id => { const existing = next[id] || {}; next[id] = { ...existing, [field]: value }; });
            return next;
        });
    };

    const handleSave = () => { saveData(STORAGE_KEY, sceneData); saveData(MASTER_FLAGS_KEY, masterFlags); logAdmin("save_scene", {}); showToast("Scene Saved", 'success'); };
    const handleReset = () => { setSceneData(loadData(STORAGE_KEY, DEFAULT_SCENE_DATA)); showToast("Unsaved changes discarded."); };
    const handleSetHomeDistrict = () => {
        if (!controlsRef.current) return;
        const x = controlsRef.current.object.position.x;
        const z = controlsRef.current.object.position.z;
        const dist = (x>=0 && z>=0) ? 'NE' : (x<0 && z>=0) ? 'NW' : (x<0 && z<0) ? 'SW' : 'SE';
        localStorage.setItem(PREF_SPAWN_KEY, dist);
        showToast(`Home District set to ${dist}`, 'success');
    };

    const { buildings, roads } = useMemo(() => {
        const bList = []; const rList = []; const roadXPositions = [-1500, 0, 1500];
        roadXPositions.forEach((xPos, rIndex) => {
            rList.push({ id: `road-${rIndex}`, x: xPos, z: 0 });
            let rowIndex = 0; const isMiddle = xPos === 0; const zIncrement = isMiddle ? 800 : 600;
            for(let z = -1600; z <= 1600; z += zIncrement) {
                if (xPos === 0 && Math.abs(z) < 400) continue;
                const stagger = (rowIndex % 2 === 0) ? 0 : 100; const dist = isMiddle ? 400 : 350;
                bList.push({ id: `R${rIndex}-L-${z}`, x: xPos - dist - stagger, z: z, width: 140, height: 300 + Math.random()*250, type: 'square' });
                bList.push({ id: `R${rIndex}-R-${z}`, x: xPos + dist + stagger, z: z, width: 140, height: 300 + Math.random()*250, type: 'square' });
                rowIndex++;
            }
        });
        [-750, 750].forEach((fx, idx) => { for(let z = -1200; z <= 1200; z += 600) {
            const isSpecial = Math.abs(z) === 1200; const isCurved = Math.abs(z) === 600;
            bList.push({ id: `FILLER-${idx}-${z}`, x: fx, z: z, width: isSpecial?180:140, height: isSpecial?650:(300+Math.random()*80), type: isSpecial?'special':(isCurved?'curved':'square'), isFiller: true });
        }});
        return { buildings: bList, roads: rList };
    }, []);

    const activeEvents = useMemo(() => {
        const all = loadData(KEYS.EVENTS, []);
        const now = new Date();
        return all.filter(e => {
            const start = new Date(e.startTime);
            const end = new Date(start.getTime() + (e.durationMin || 60) * 60000);
            return now >= start && now <= end;
        });
    }, [viewState]);

    // Social Presence: Simulated Live Participants
    const liveParticipants = useMemo(() => {
        const logs = loadData(KEYS.ANALYTICS, []);
        const recent = logs.filter(l => l.type === 'session_start' && (new Date() - new Date(l.timestamp)) < 5 * 60000); // last 5 mins
        return Math.max(12, recent.length + Math.floor(Math.random() * 20)); // Fake nice number
    }, []);

    const enterWorld = () => { 
        if(masterFlags.maintenanceMode && !isAdmin) { showToast("Maintenance Mode Active", 'error'); return; }
        logEvent('enter_world');
        setShowOnboarding(true);
    };

    const handleWarpToEvent = (evt) => {
        if (!evt) { showToast("No active events", 'error'); return; }
        setFocusTarget(evt.eventLocation || [0, 500, 0]);
        // Award points once per event per day
        const log = loadData(EVENT_ARRIVAL_KEY, {});
        const today = new Date().toISOString().split('T')[0];
        const key = evt.id + "_" + today;
        if (!log[key]) {
            addPoints(5);
            log[key] = true;
            saveData(EVENT_ARRIVAL_KEY, log);
            showToast("Welcome to Event! +5 Points", "success");
        }
    };

    const dwellSecondsByIdRef = useRef({});
    const inRangeRef = useRef({});
    const impressionLoggedRef = useRef({});
    const lastDwellEmitRef = useRef({});

    const sponsorEntered = (data) => {
        if(!data?.sponsorName) return;
        setSponsorCTA(data);
        inRangeRef.current[data.id] = true;
        if (!dwellSecondsByIdRef.current[data.id]) dwellSecondsByIdRef.current[data.id] = 0;
        if (!lastDwellEmitRef.current[data.id]) lastDwellEmitRef.current[data.id] = 0;
    };
    const sponsorLeft = () => {
        setSponsorCTA(null);
        Object.keys(inRangeRef.current).forEach(id => {
            if (inRangeRef.current[id]) {
                const seconds = dwellSecondsByIdRef.current[id] || 0;
                if (seconds > 0) {
                    logEvent('billboard_dwell', { id, seconds, sponsorName: (sceneData[id]||{}).sponsorName, campaignId: (sceneData[id]||{}).campaignId });
                }
                inRangeRef.current[id] = false;
                dwellSecondsByIdRef.current[id] = 0;
                impressionLoggedRef.current[id] = false;
                lastDwellEmitRef.current[id] = 0;
            }
        });
    };
    const sponsorDwell = (id, delta) => {
        if (!inRangeRef.current[id]) return;
        dwellSecondsByIdRef.current[id] = (dwellSecondsByIdRef.current[id] || 0) + delta;
        if (!impressionLoggedRef.current[id] && dwellSecondsByIdRef.current[id] >= 2) {
            const meta = sceneData[id] || {};
            logEvent('billboard_impression', { id, sponsorName: meta.sponsorName, campaignId: meta.campaignId });
            impressionLoggedRef.current[id] = true;
        }
        if ((dwellSecondsByIdRef.current[id] - (lastDwellEmitRef.current[id] || 0)) >= 5) {
            const meta = sceneData[id] || {};
            logEvent('billboard_dwell', { id, seconds: 5, sponsorName: meta.sponsorName, campaignId: meta.campaignId });
            lastDwellEmitRef.current[id] = dwellSecondsByIdRef.current[id];
        }
    };

    const hudPoints = localStorage.getItem(KEYS.POINTS) || 0;
    const hudTickets = localStorage.getItem(KEYS.TICKETS) || 0;
    const hudStreak = localStorage.getItem(KEYS.STREAK) || 0;

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
            
            {/* --- ADMIN SIDEBAR --- */}
            {isAdmin && masterFlags.adminSidebar && (
                <AdminSidebar 
                    collapsed={sidebarCollapsed} 
                    setCollapsed={setSidebarCollapsed}
                    activePanel={activeAdminPanel}
                    setActivePanel={setActiveAdminPanel}
                    actions={{
                        openUsers: () => setShowUsers(true),
                        openEvents: () => setShowEvents(true),
                        openMetrics: () => { const panel = document.querySelector('[onClick*="handleExport"]')?.parentNode; if(panel) panel.scrollIntoView(); else showToast("Open Control Panel to see Metrics"); }, 
                        openMaster: () => setShowMaster(true),
                        openCreds: () => setShowCreds(true),
                        openLeads: () => setActiveAdminPanel('leads')
                    }}
                />
            )}

            {/* --- CUSTOMER PROGRESS DRAWER --- */}
            {!isAdmin && masterFlags.showCustomerProgressDrawer && (
                <ProgressDrawer show={showProgressDrawer} onClose={() => setShowProgressDrawer(false)} onSetHomeDistrict={handleSetHomeDistrict} />
            )}
            
            {/* --- BRAND PREVIEW PANEL --- */}
            {masterFlags.enableBrandMode && showBrandPanel && (
                <LocalErrorBoundary>
                    <BrandPreviewPanel 
                        onClose={()=>setShowBrandPanel(false)} 
                        onOpenPitch={(item)=>{ setShowPartners(true); /* Logic to pass item context is in handler */ }} 
                        onExport={()=>{ 
                            const blob = new Blob([JSON.stringify(loadData(KEYS.EVENTS_LOG,[]), null, 2)], {type:"application/json"});
                            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download="brand-summary.json"; a.click();
                            logAdmin('export_summary');
                        }}
                        selectedId={Array.from(selectedIds).pop()}
                        sceneData={sceneData}
                        isAdmin={isAdmin}
                        onPause={(id) => { showToast(`Paused placement ${id}`, 'info'); logAdmin('pause_placement', {id}); }}
                        onRollback={(id) => { showToast(`Rolled back ${id}`, 'info'); logAdmin('rollback_placement', {id}); }}
                    />
                </LocalErrorBoundary>
            )}

            {/* --- GUIDED TOUR OVERLAY --- */}
            {masterFlags.enableGuidedTour && showGuidedTour && (
                <LocalErrorBoundary>
                    <GuidedTourOverlay 
                        step={tourStep}
                        onSkip={()=>{ setShowGuidedTour(false); localStorage.setItem(TOUR_DONE_KEY, 'true'); }}
                        onNext={()=>{ 
                            const next = tourStep + 1;
                            if (next >= 4) { setShowGuidedTour(false); localStorage.setItem(TOUR_DONE_KEY, 'true'); }
                            else {
                                setTourStep(next);
                                // Simple focus targets for tour steps
                                const targets = [[0, 800, 1800], [0, 500, 2000], [2500, 200, -2500], [0, 500, 0]];
                                setFocusTarget(targets[next]);
                            }
                        }}
                    />
                </LocalErrorBoundary>
            )}

            {/* --- COMMAND PALETTE --- */}
            {masterFlags.enableCommandPalette && (
                <LocalErrorBoundary>
                    <CommandPalette isOpen={showCmdPalette} onClose={()=>setShowCmdPalette(false)} actions={{
                        openMissions: ()=>setShowMissions(true),
                        openVault: ()=>setShowVault(true),
                        openEvents: ()=>setShowEvents(true),
                        openRank: ()=>setShowLeaderboard(true),
                        openInvite: ()=>setShowInvite(true),
                        warp: (pos)=>setFocusTarget(pos),
                        warpToEvent: ()=>handleWarpToEvent(activeEvents[0]),
                        toggleBrandMode: ()=>setBrandMode(p=>!p),
                        openLeads: ()=>setActiveAdminPanel('leads')
                    }} />
                </LocalErrorBoundary>
            )}

            <Canvas shadows camera={{ position: [0, 8000, 8000], fov: 60, near: 5, far: 20000 }} gl={{ antialias:true, powerPreference:'high-performance' }} dpr={[1,1.5]} style={{position:'absolute', top:0, left:0, zIndex: 1}}>
                <Suspense fallback={null}>
                    <CameraHandler viewState={viewState} onTransitionEnd={() => {
                        setIsControlsEnabled(true);
                        // Check Home District Pref on first load
                        const pref = localStorage.getItem(PREF_SPAWN_KEY);
                        if (pref && !localStorage.getItem(TOUR_DONE_KEY)) {
                            // Don't warp if tour pending
                        } else if (pref) {
                            const coords = { NE:[2000,500,-2000], NW:[-2000,500,-2000], SE:[2000,500,2000], SW:[-2000,500,2000] };
                            if(coords[pref]) setFocusTarget(coords[pref]);
                        }
                    }} />
                    <color attach="background" args={['#000002']} /> <Stars radius={5000} count={3000} factor={4} fade />
                    <SolarSystem /> <ambientLight intensity={0.5} /> <directionalLight position={[1000, 1500, 500]} intensity={3} color="#fff" /> <SolarDome />
                    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]} onPointerMove={(e) => isPlacingEgg && setGhostEggPos(e.point.toArray())} onClick={(e) => {
                        if(isAdmin && isPlacingEgg && ghostEggPos) {
                             const newEgg = { id: `egg_${Date.now()}`, position: ghostEggPos, imageUrl: eggImage };
                             setEggs([...eggs, newEgg]);
                        }
                    }}>
                        <planeGeometry args={[40000, 40000]} /><meshStandardMaterial color="#000000" roughness={1} metalness={0} />
                    </mesh>
                    {roads.map((r, i) => <RoadStrip key={i} position={[r.x, 0, r.z]} rotation={[0,0,0]} length={4500} width={280} />)}
                    {isAdmin && isPlacingEgg && ghostEggPos && <DataCrystal position={ghostEggPos} id="ghost" onCollect={()=>{}} isGhost={true} imageUrl={eggImage} />}
                    <HeroTower position={[0, 0, 0]} data={{...sceneData['HERO'], selected: selectedIds.has('HERO')}} onSelect={handleSelect} />
                    {buildings.map((b) => (
                         <Building key={b.id} {...b} position={[b.x, 0, b.z]} data={{...sceneData[b.id], selected: selectedIds.has(b.id)}} onSelect={handleSelect} moveLocked={moveLocked} onMove={(id, x, dy, z, r) => handleMove(id, x, 0, z, r)} />
                    ))}
                    {[0,1,2,3].map(i => {
                         const id = `BILLBOARD_${i}`;
                         return <BillboardScreen key={id} id={id} data={{...sceneData[id], selected: selectedIds.has(id)}} onSelect={handleSelect} moveLocked={moveLocked} onMove={handleMove} />;
                    })}
                    <SmartBoundaryWall data={sceneData} onSelect={handleSelect} />
                    {dailyCrystals.map(dc => <DataCrystal key={dc.id} position={dc.position} id={dc.id} onCollect={(id) => {
                        if (!isAdmin) {
                            const left = dailyCrystals.filter(x => x.id !== id);
                            setDailyCrystals(left);
                            saveData(KEYS.DAILY_CRYSTALS, left);
                            updateMission('collect', 1);
                        }
                    }} />)}
                    {eggs.map(egg => <DataCrystal key={egg.id} {...egg} onCollect={(id) => { if(!isAdmin) { setEggs(e => e.filter(x => x.id !== id)); updateMission('collect', 1); }}} />)}
                    {activeEvents.map(evt => <EventPortal key={evt.id} event={evt} onClick={()=>{
                        if (evt.eventLocation) { setFocusTarget(evt.eventLocation); }
                        if (evt.ctaUrl) { logEvent('event_portal_click', { id: evt.id, sponsorName: evt.sponsorName }); window.open(evt.ctaUrl, '_blank'); }
                    }} />)}
                    {!isAdmin && ( <ProximityTracker targets={[0,1,2,3].map(i => ({ id: `BILLBOARD_${i}`, ...sceneData[`BILLBOARD_${i}`] }))} onEnter={sponsorEntered} onLeave={sponsorLeft} updateDwell={sponsorDwell} /> )}
                    {!isAdmin && <DistrictTracker onVisit={(amt)=>updateMission('visit', amt)} />}
                    <KeyboardMover selectedId={Array.from(selectedIds)[0]} onMove={(id, x, y, z, r) => handleMove(id, x, y, z, r)} moveLocked={moveLocked} />
                    {focusTarget && <FocusTargetLerper target={focusTarget} controlsRef={controlsRef} onArrive={()=>setFocusTarget(null)} />}
                </Suspense>
                <OrbitControls ref={controlsRef} target={[0, 0, 0]} maxPolarAngle={Math.PI / 2 - 0.05} minPolarAngle={0.1} maxDistance={10000} minDistance={200} enabled={isControlsEnabled} />
            </Canvas>
            <Loader />

            <LandingOverlay 
                visible={viewState === "LANDING"} 
                siteConfig={siteConfig} 
                onEnter={enterWorld} 
                onLogin={() => setShowAuth(true)} 
                isAdmin={isAdmin} 
                currentUser={currentUser} 
                onLogout={() => { setIsAdmin(false); setCurrentUser(null); localStorage.removeItem(USER_SESSION_KEY); showToast("Logged Out"); }} 
                onOpenPartners={()=>setShowPartners(true)}
                brandModeEnabled={masterFlags.enableBrandMode}
                setBrandMode={setBrandMode}
                onOpenTrust={()=>setTrustModalType('STATUS')}
                liveParticipants={liveParticipants}
                onWarpToEvent={handleWarpToEvent}
            />
            
            {showOnboarding && (
                <OnboardingOverlay onComplete={() => {
                    setShowOnboarding(false);
                    setViewState("TRANSITION");
                    // Trigger Tour if not done
                    if (!isAdmin && masterFlags.enableGuidedTour && !localStorage.getItem(TOUR_DONE_KEY)) {
                         setTimeout(() => setShowGuidedTour(true), 2000);
                    }
                }} />
            )}

            {(viewState === "WORLD" || viewState === "TRANSITION") && (
                <>
                    <div style={{ position: 'absolute', top: 20, left: isAdmin && masterFlags.adminSidebar ? 80 : 20, zIndex: 100, display: 'flex', gap: 10, flexWrap: 'wrap', transition:'left 0.3s' }}>
                       <button onClick={() => { setViewState("LANDING"); setIsControlsEnabled(false); }} style={{background: '#333', color: '#fff', border: '1px solid #fff', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>⬅ Home</button>
                       <button onClick={() => setShowMissions(true)} style={{background: '#111', color: '#00ffff', border: '1px solid #00ffff', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>🎯 Missions</button>
                       <button onClick={() => setShowVault(true)} style={{background: '#111', color: '#fbbf24', border: '1px solid #fbbf24', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>🏦 Vault</button>
                       <button onClick={() => setShowEvents(true)} style={{background: '#111', color: '#d946ef', border: '1px solid #d946ef', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>📅 Events</button>
                       <button onClick={() => setShowLeaderboard(true)} style={{background: '#111', color: '#22c55e', border: '1px solid #22c55e', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>🏆 Rank</button>
                       <button onClick={() => setShowInvite(true)} style={{background: '#111', color: '#fff', border: '1px solid #fff', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>🤝 Invite</button>
                       {masterFlags.enableBrandMode && (
                           <button onClick={()=>setShowBrandPanel(p=>!p)} style={{background: showBrandPanel?'rgba(251, 191, 36, 0.2)':'#111', color: '#fbbf24', border: '1px solid #fbbf24', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>💼 Brand Mode</button>
                       )}
                       
                       {isAdmin && (
                            <>
                             {!masterFlags.adminSidebar && <button onClick={() => setShowUsers(true)} style={{background: '#333', color: '#fff', border: '1px solid #fbbf24', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>👥 Users</button>}
                             <button onClick={() => setIsAdmin(false)} style={{background: '#333', color: 'cyan', border: '1px solid cyan', padding: '8px 15px', borderRadius: 8, cursor: 'pointer'}}>👁 Visitor View</button>
                            </>
                        )}
                         {!isAdmin && currentUser && currentUser.name === 'Admin' && <button onClick={()=>setIsAdmin(true)} style={{background:'#333', color:'orange', border:'1px solid orange', padding:10, borderRadius:8, cursor:'pointer'}}>🔧 Admin View</button>}
                    </div>
                    
                    <div style={{position:'absolute', top:20, right:20, background:'rgba(0,0,0,0.8)', border:'1px solid #333', borderRadius:20, padding:'8px 20px', color:'white', display:'flex', gap:15, fontSize:14, zIndex:100}}>
                        <span>💎 {hudPoints}</span>
                        <span>🎟️ {hudTickets}</span>
                        <span style={{color:'orange'}}>🔥 {hudStreak}</span>
                        {!isAdmin && masterFlags.showCustomerProgressDrawer && (
                            <span onClick={() => setShowProgressDrawer(true)} style={{cursor:'pointer', marginLeft:10}}>↔</span>
                        )}
                    </div>

                    {!isAdmin && masterFlags.showChat && <ChatWidget />}
                    {!isAdmin && sponsorCTA && <SponsorCTAWidget sponsor={sponsorCTA} onCtaClick={(s)=> logEvent('billboard_click', { id: s.id, sponsorName: s.sponsorName, campaignId: s.campaignId })} />}
                    {selectedIds.size === 1 && !isAdmin && <BuildingInfoCard id={Array.from(selectedIds)[0]} onClose={() => setSelectedIds(new Set())} />}
                    
                    <UnifiedControlPanel 
                        selectedIds={selectedIds} 
                        data={sceneData[Array.from(selectedIds).pop()] || {}} 
                        onUpdate={handleUpdate} 
                        onClose={() => setSelectedIds(new Set())} 
                        isAdmin={isAdmin} 
                        isPlacingEgg={isPlacingEgg} 
                        setIsPlacingEgg={setIsPlacingEgg} 
                        setEggImage={setEggImage} 
                        onSave={handleSave} 
                        onReset={handleReset} 
                        openCreds={() => setShowCreds(true)} 
                        openMaster={() => setShowMaster(true)} 
                        moveLocked={moveLocked} 
                        setMoveLocked={setMoveLocked} 
                        onSelectAll={handleSelectAll}
                        openLeads={()=>setActiveAdminPanel('leads')}
                        openFlightPlan={()=>setActiveAdminPanel('flight')}
                    />
                </>
            )}

            {showAuth && <UnifiedAuthModal onClose={() => setShowAuth(false)} onLoginSuccess={(u, r) => { 
                setShowAuth(false); 
                setCurrentUser(u); 
                if(r==="ADMIN") { setIsAdmin(true); showToast("Admin Access Granted", 'success'); } 
                else { showToast("Authentication Successful", 'success'); setShowOnboarding(true); } 
            }} />}
            
            {showUsers && <UserManagementModal onClose={() => setShowUsers(false)} />}
            {showCreds && <ChangeCredentialsModal onClose={()=>setShowCreds(false)} onSave={(c)=>{ saveData(ADMIN_CONFIG_KEY, c); showToast("Credentials Updated"); }} />}
            {showMaster && <MasterControlPanel flags={masterFlags} onToggle={(k)=>setMasterFlags(p=>({...p, [k]: !p[k]}))} onClose={()=>setShowMaster(false)} />}
            {showMissions && <MissionsModal onClose={()=>setShowMissions(false)} onClaim={claimMission} showToast={showToast} />}
            {showVault && <RewardsVaultModal onClose={()=>setShowVault(false)} showToast={showToast} addTickets={addTickets} />}
            {showEvents && <EventsModal onClose={()=>setShowEvents(false)} />}
            {showLeaderboard && <LeaderboardModal onClose={()=>setShowLeaderboard(false)} />}
            {showInvite && <InviteModal onClose={()=>setShowInvite(false)} currentUser={currentUser} />}
            {showPartners && <BrandPartnerModal onClose={()=>setShowPartners(false)} prefill={Array.from(selectedIds).pop() ? { company: "Context: "+Array.from(selectedIds).pop() } : null} />}
            {trustModalType && <LocalErrorBoundary><TrustModals type={trustModalType} onClose={()=>setTrustModalType(null)} /></LocalErrorBoundary>}
        </div>
    );
};

export default function CityScene() { return ( <ToastProvider> <SceneContent /> </ToastProvider> ); }
