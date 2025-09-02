// pages/index.js
import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import SliderSection from '../components/SliderSection'; // Asegúrate de que la ruta es correcta
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div>
      <Header />
      <main>
        <HeroSection />
        {/* Sección del Slider */}
        <SliderSection />
      </main>
      <Footer />
    </div>
  );
}
