"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type NodeT = { id: string; x: number; y: number; size: number; tokens: number; isSelf?: boolean };
type ConnT = { id: string; from: number; to: number };

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateNodes(count: number): NodeT[] {
  const arr: NodeT[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `n-${i}-${Math.random().toString(36).slice(2, 8)}`,
      x: rand(5, 95),
      y: rand(10, 90),
      size: rand(20, 40),
      tokens: rand(0, 100),
    });
  }
  return arr;
}

function generateConnections(nodeCount: number, connectionCount: number): ConnT[] {
  const arr: ConnT[] = [];
  for (let i = 0; i < connectionCount; i++) {
    arr.push({
      id: `c-${i}-${Math.random().toString(36).slice(2, 8)}`,
      from: Math.floor(Math.random() * nodeCount),
      to: Math.floor(Math.random() * nodeCount),
    });
  }
  return arr;
}

export default function JharviMockupBackground({
  points = 0,
  imageSrc = "/img/garden.png",
  overlayOpacity = 0.4,
  showSelfNode = true,
  className = "",
}: {
  points?: number;
  imageSrc?: string;
  overlayOpacity?: number;
  showSelfNode?: boolean;
  className?: string;
}) {
  const BASE_COUNT = 20;
  const MAX_NODE_SIZE = 60;

  // ⬇️ Genera SOLO una vez por montaje (useRef) y no durante el render SSR
  const nodesRef = useRef<NodeT[] | null>(null);
  const connsRef = useRef<ConnT[] | null>(null);
  const selfAddedRef = useRef(false);

  if (nodesRef.current === null) {
    nodesRef.current = generateNodes(BASE_COUNT);
  }
  if (connsRef.current === null) {
    connsRef.current = generateConnections(BASE_COUNT, 35);
  }

  const [nodes, setNodes] = useState<NodeT[]>(nodesRef.current);
  const connections = connsRef.current;

  // ⬇️ Agrega el nodo “Tú” una sola vez, con ID estable
  useEffect(() => {
    if (!showSelfNode || selfAddedRef.current) return;
    selfAddedRef.current = true;
    const self: NodeT = {
      id: `self-${Math.random().toString(36).slice(2, 8)}`,
      x: rand(10, 90),
      y: rand(15, 85),
      size: 28,
      tokens: 0,
      isSelf: true,
    };
    setNodes((prev) => [self, ...prev]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSelfNode]);

  // ⬇️ Animación progresiva (solo cliente, después de montar)
  useEffect(() => {
    const id = setInterval(() => {
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          size: Math.min(MAX_NODE_SIZE, n.size + Math.random() * 2),
          tokens: Math.min(50000, n.tokens + Math.random() * 5),
        }))
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`fixed inset-0 -z-10 pointer-events-none ${className}`}>
      {/* Imagen de fondo */}
      <img
        src={imageSrc}
        alt="Jharvi background"
        className="absolute inset-0 w-full h-full object-cover opacity-90"
        draggable={false}
      />
      {/* Velo negro */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
      />

      {/* Capa de nodos */}
      <div className="absolute inset-0">
        {/* Conexiones */}
        {connections!.map((c) => {
          const from = nodes[c.from % nodes.length];
          const to = nodes[c.to % nodes.length];
          if (!from || !to) return null;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              className="absolute bg-emerald-400/50"
              style={{
                left: `${Math.min(from.x, to.x)}%`,
                top: `${Math.min(from.y, to.y)}%`,
                width: `${Math.abs(from.x - to.x)}%`,
                height: 1,
                transform: `rotate(${angle}rad)`,
              }}
            />
          );
        })}

        {/* Nodos */}
        {nodes.map((n) => (
          <motion.div
            key={n.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.02 }}
            className="absolute flex flex-col items-center"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <motion.div
              className={`rounded-full bg-gradient-to-br from-emerald-400 to-lime-400 shadow-lg border ${
                n.isSelf ? "border-emerald-300" : "border-white/10"
              }`}
              style={{ width: n.size, height: n.size }}
              animate={{ boxShadow: ["0 0 10px #00ffcc", "0 0 20px #00ffaa"] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            {/* Este texto es dinámico; si alguna vez volvieras a SSR, evita warning */}
            <span
              className="text-xs mt-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              suppressHydrationWarning
            >
              {n.isSelf ? "Tú • " : ""}
              {(n.isSelf ? points : Math.floor(n.tokens)).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}{" "}
              $JHARVI
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
