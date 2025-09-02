"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import JharviMockupBackground from "@/components/JharviMockupBackground";
import { ChevronDown } from "lucide-react";

// Puedes editar/añadir preguntas aquí
const faqs: { question: string; answer: string }[] = [
  {
    question: "Where can I get my referral code to join?",
    answer:
      "You can find your referral code on the Portal. Look at the top section where it says 'copy the referral code'.",
  },
  { question: "Is the Mint Fee in Ethereum (ETH)?", answer: "No." },
  {
    question: "Can users mint both the Pass and the Founder Pass?",
    answer: "No, users can only mint one type of pass per wallet.",
  },
  {
    question: "How do I submit a proof?",
    answer:
      "Submit a proof in the Proofs section. It can only be submitted once and is required to qualify for the airdrop.",
  },
  {
    question: "Will my task points be added to my airdrop points?",
    answer: "Yes, task points are added to your airdrop points.",
  },
  { question: "Can you airdrop multiple accounts?", answer: "No, multi-accounting is not allowed." },
];

export default function FAQsPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) =>
    setOpenIndex((prev) => (prev === index ? null : index));

  return (
    <div className="relative ml-64 min-h-screen overflow-y-auto text-white">
      {/* ===== Fondo global con mockup a pantalla completa ===== */}
      <JharviMockupBackground points={0} />

      {/* Sidebar translúcido (igual que Rewards) */}
      <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
        <Sidebar />
      </div>

      {/* Contenido sobre el mockup */}
      <div className="relative z-10 flex-1 min-h-screen">
        {/* Navbar translúcido (igual que Rewards) */}
        <div className="[&_*]:bg-transparent [&_*]:bg-opacity-0 [&_*]:backdrop-blur-sm">
          <Navbar />
        </div>

        {/* Contenido principal */}
        <div className="p-6 -mt-14">
          <div className="mt-12 ml-10">
          </div>

          {/* Card envolvente (mismo estilo que el card de Rewards) */}
          <div className="mx-4 md:mx-10 bg-[#096b2b]/40 backdrop-blur-sm border border-white/10 rounded-xl p-4 mt-10 shadow-[0px_4px_0px_rgba(0,0,0,0.6)]">
            {/* Subtítulo / badge opcional para coherencia */}
            <div className="flex items-center justify-between mb-4">
              <div className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full text-sm font-semibold shadow-[0px_2px_0px_rgba(0,0,0,0.6)]">
                Help Center · Common Questions
              </div>
            </div>

            {/* Lista de FAQs */}
            <div className="space-y-3">
              {faqs.map((faq, index) => {
                const open = openIndex === index;
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-white/10 overflow-hidden bg-black/30"
                  >
                    <button
                      onClick={() => toggleFAQ(index)}
                      className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left text-white hover:bg-white/5 transition"
                      aria-expanded={open}
                      aria-controls={`faq-panel-${index}`}
                    >
                      <span className="text-base md:text-lg font-semibold">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Panel de respuesta */}
                    <div
                      id={`faq-panel-${index}`}
                      className={`px-4 pb-3 pt-0 text-sm text-white/90 border-t border-white/10 ${
                        open ? "block" : "hidden"
                      }`}
                    >
                      {faq.answer}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
