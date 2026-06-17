import Image from "next/image";
import Link from "next/link";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 z-50 h-16 border-b border-white/6 bg-white/7 backdrop-blur-md">
      <nav>
        <Link href="/">
          <Image
            src="/zottin-logo.svg"
            alt="Zottin Logo"
            width={100}
            height={100}
            className="h-9 w-auto rounded-md"
          />
        </Link>
      </nav>
    </header>
  );
};

export default Header;
