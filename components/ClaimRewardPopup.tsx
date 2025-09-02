"use client";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ClaimRewardPopup({
  onClose,
  onConfirm,
  level = 1,
  points = 500,
  open = true,
}: {
  onClose: () => void;
  onConfirm?: () => Promise<void> | void;
  level?: number;
  points?: number;
  open?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Panel estilo “profile” */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="
              relative w-[360px] max-w-[92vw]
              rounded-[22px]
              bg-white/8
              backdrop-blur-xl
              shadow-[0_10px_30px_rgba(0,0,0,.45)]
              ring-1 ring-white/15
              border border-black/60
              text-white
              px-6 py-6
            "
          >
            {/* botón cerrar */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full
                         bg-[#0cbb3a] text-white border border-black/70 shadow-[2px_2px_0_#000]
                         hover:scale-105 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {/* header */}
            <div className="text-center">
              <h2
                className="
                  inline-block text-[15px] font-bold
                  px-4 py-1 rounded-full
                  bg-[#0cbb3a]
                  border border-black/70
                  shadow-[2px_2px_0_#000]
                "
              >
                Claim Your Referrals Reward!
              </h2>

              <p className="mt-3 text-[13px] text-white/80 font-medium">
                Great! You Completed Bonus {level}: {points.toLocaleString()} Points
              </p>
            </div>

            {/* contenido */}
            <div className="mt-5 flex flex-col items-center">
              <img
                src="/img/gift.png"
                alt="Gift"
                className="w-16 h-16 drop-shadow-[0_0_14px_rgba(12,187,58,.35)]"
              />

              {/* puntos */}
              <div className="mt-3 flex items-center gap-2">
                <img
                  src="/img/logocircular.png"
                  alt="Leaf Icon"
                  className="w-9 h-9 rounded-full border border-black/70 shadow-[2px_2px_0_#000]"
                />
                <div className="text-3xl font-extrabold text-[#0cbb3a] leading-none">
                  {points.toLocaleString()}
                </div>
                <span className="text-white text-sm font-semibold self-end mb-[2px]">Points</span>
              </div>

              {/* botón principal estilo pill */}
              <button
                onClick={async () => {
                  if (onConfirm) await onConfirm();
                }}
                className="
                  mt-5 px-6 py-2.5 rounded-full
                  bg-gradient-to-b from-[#12d455] to-[#0cbb3a]
                  text-white font-bold
                  border border-black/70
                  shadow-[2px_2px_0_#000,0_8px_20px_rgba(12,187,58,.25)]
                  hover:brightness-110 hover:translate-y-[-1px]
                  active:translate-y-[0px]
                  transition
                "
              >
                Claim Reward
              </button>

              <p className="text-[12px] text-white/70 mt-3">
                You are claiming for: Bonus {level} rewards.
              </p>
              <p className="text-[12px] text-white/55 mt-1 text-center">
                Once you redeem this reward, you will be able to achieve new goals and earn more rewards.
              </p>
            </div>

            {/* footer / help */}
            <div className="mt-6 text-center">
              <button
                className="
                  text-[13px] font-semibold underline
                  text-[#0cbb3a] hover:text-emerald-400
                "
              >
                Need help?
              </button>
            </div>

            {/* borde exterior suave como el profile */}
            <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-black/40" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
