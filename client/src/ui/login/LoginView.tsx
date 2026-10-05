import type { FormEventHandler } from 'react';
import { ArrowRight, Boxes, MapPin, Route, Truck } from 'lucide-react';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { ICON_SIZE } from '../icons';

type LoginViewProps = {
  email: string;
  password: string;
  error: string;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function LoginView({
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginViewProps) {
  return (
    <main className="w-full min-h-[100dvh] p-5 bg-surface grid grid-cols-[minmax(520px,1.05fr)_minmax(500px,0.95fr)] max-[1100px]:grid-cols-[minmax(390px,0.9fr)_minmax(430px,1.1fr)] min-[761px]:max-[1080px]:grid-cols-1 min-[761px]:max-[1080px]:gap-5 min-[761px]:max-[1080px]:p-5 max-[760px]:block max-[760px]:p-0 max-[760px]:bg-white">
      <section
        className="relative flex flex-col min-h-[calc(100dvh-40px)] p-8 min-[1500px]:p-[clamp(36px,2.5vw,64px)] min-[761px]:max-[1080px]:min-h-[320px] min-[761px]:max-[1080px]:p-7 max-[760px]:hidden overflow-hidden text-white bg-primary rounded-card"
        aria-label="Waypoint logistics"
      >
        <div className="relative z-2">
          <Brand context="LOGISTICS" inverse />
        </div>
        <div
          className="absolute top-[clamp(56px,5vw,100px)] right-[clamp(-140px,-4vw,-70px)] left-[clamp(24px,5vw,120px)] h-[clamp(420px,40vw,760px)] min-h-[380px] min-[761px]:max-[1080px]:top-[-20px] min-[761px]:max-[1080px]:right-[-60px] min-[761px]:max-[1080px]:left-[24%] min-[761px]:max-[1080px]:h-[370px] min-[761px]:max-[1080px]:min-h-0 min-[761px]:max-[1080px]:opacity-[0.92]"
          aria-hidden="true"
        >
          <span className="absolute grid place-items-center rounded-card top-[3%] left-[9%] w-[clamp(150px,10vw,260px)] h-[clamp(120px,8vw,208px)] min-[761px]:max-[1080px]:w-[138px] min-[761px]:max-[1080px]:h-[106px] bg-chilled" />
          <span className="absolute grid place-items-center rounded-card top-[10%] right-[13%] w-[clamp(190px,12vw,310px)] h-[clamp(140px,9vw,230px)] min-[761px]:max-[1080px]:w-[172px] min-[761px]:max-[1080px]:h-[126px] bg-ambient" />
          <span className="absolute grid place-items-center rounded-card top-[48%] left-[34%] w-[clamp(170px,11vw,280px)] h-[clamp(120px,8vw,208px)] min-[761px]:max-[1080px]:w-[154px] min-[761px]:max-[1080px]:h-[108px] bg-textile" />
          <span className="absolute grid place-items-center rounded-card top-[57%] right-[3%] w-[clamp(145px,9vw,230px)] h-[clamp(112px,7vw,180px)] min-[761px]:max-[1080px]:w-[132px] min-[761px]:max-[1080px]:h-[102px] bg-fragile" />
          <svg
            viewBox="0 0 640 430"
            role="presentation"
            className="absolute inset-0 w-full h-full overflow-visible"
          >
            <path
              d="M-30 360C90 348 124 248 226 252C342 256 350 106 476 110C550 112 590 60 676 26"
              className="fill-none stroke-white stroke-[5px] [stroke-linecap:round]"
            />
            <circle cx="225" cy="252" r="13" className="fill-primary stroke-white stroke-[5px]" />
            <circle cx="477" cy="110" r="13" className="fill-primary stroke-white stroke-[5px]" />
          </svg>
          <span className="absolute grid place-items-center w-[52px] h-[52px] text-primary bg-white rounded-full [&>svg]:static [&>svg]:w-6 [&>svg]:h-6 top-[21%] left-[26%]">
            <Route size={ICON_SIZE.symbol} aria-hidden="true" />
          </span>
          <span className="absolute grid place-items-center w-[52px] h-[52px] text-primary bg-white rounded-full [&>svg]:static [&>svg]:w-6 [&>svg]:h-6 top-[20%] right-[20%]">
            <Truck size={ICON_SIZE.symbol} aria-hidden="true" />
          </span>
          <span className="absolute grid place-items-center w-[52px] h-[52px] text-primary bg-white rounded-full [&>svg]:static [&>svg]:w-6 [&>svg]:h-6 top-[57%] left-[47%]">
            <Boxes size={ICON_SIZE.symbol} aria-hidden="true" />
          </span>
          <span className="absolute grid place-items-center w-[52px] h-[52px] text-primary bg-white rounded-full [&>svg]:static [&>svg]:w-6 [&>svg]:h-6 top-[67%] right-[14%]">
            <MapPin size={ICON_SIZE.symbol} aria-hidden="true" />
          </span>
        </div>
        <div className="relative z-2 w-[min(100%,560px)] mt-auto mb-[38px] min-[761px]:max-[1080px]:hidden">
          <p className="mb-3 text-[#bcbcbc] text-xs font-semibold leading-[1.4]">
            ONE CONNECTED WORKFLOW
          </p>
          <h1
            id="brand-heading"
            className="max-w-[540px] mb-[18px] text-[clamp(42px,5vw,72px)] max-[1100px]:text-[clamp(40px,5vw,56px)] font-[650] leading-[1.02] text-balance"
          >
            Every delivery, clearly on its way.
          </h1>
          <p className="max-w-[470px] mb-0 text-[#c8c8c8] text-base leading-[1.55] text-pretty">
            From order planning to store receipt, Waypoint keeps every team moving together.
          </p>
        </div>
        <p className="relative z-2 mb-0 text-[#a6a6a6] text-xs min-[761px]:max-[1080px]:hidden">
          Dispatch · Loading · Delivery · Stores
        </p>
      </section>

      <section
        className="relative grid place-items-center p-[clamp(48px,5vw,88px)] min-[761px]:max-[1080px]:content-start min-[761px]:max-[1080px]:min-h-0 min-[761px]:max-[1080px]:px-7 min-[761px]:max-[1080px]:pt-[42px] min-[761px]:max-[1080px]:pb-14 max-[760px]:flex max-[760px]:flex-col max-[760px]:min-h-[100dvh] max-[760px]:pt-[max(28px,env(safe-area-inset-top))] max-[760px]:px-6 max-[760px]:pb-[max(24px,env(safe-area-inset-bottom))] max-[390px]:px-5"
        aria-labelledby="login-heading"
      >
        <div className="hidden max-[760px]:block max-[760px]:self-start">
          <Brand context="LOGISTICS" />
        </div>
        <div className="w-[min(100%,440px)] min-[1500px]:w-[min(100%,480px)] min-[761px]:max-[1080px]:w-[min(100%,520px)] max-[760px]:my-auto max-[760px]:py-14">
          <header className="mb-[38px] max-[760px]:mb-8">
            <p className="mb-3 text-muted text-xs font-semibold leading-[1.4]">
              WELCOME TO WAYPOINT
            </p>
            <h2
              id="login-heading"
              className="mb-2.5 text-[42px] max-[760px]:text-[38px] font-semibold leading-[1.08] text-balance"
            >
              Sign in
            </h2>
            <p className="mb-0 text-muted text-base leading-[1.55] text-pretty">
              Use your assigned credentials to access your workspace.
            </p>
          </header>

          <form onSubmit={onSubmit} className="grid gap-5">
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              placeholder="name@waypoint.lk"
              autoComplete="username"
              onChange={(event) => onEmailChange(event.target.value)}
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              placeholder="Enter your password"
              autoComplete="current-password"
              onChange={(event) => onPasswordChange(event.target.value)}
            />
            {error ? (
              <p
                className="-mt-1 mb-0 py-3 px-3.5 text-[#9e1018] bg-[#fff0f0] border border-[#ffc7ca] rounded-xl text-[13px] leading-[1.45]"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={isSubmitting}
              icon={<ArrowRight size={ICON_SIZE.action} aria-hidden="true" />}
              className="w-full mt-1"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-7 text-[#949494] text-[13px] text-center [&>strong]:text-[#666666]">
            Need access? <strong>Contact your Waypoint administrator.</strong>
          </p>
        </div>
        <footer className="absolute bottom-[30px] inset-x-16 text-[#9a9a9a] text-[11px] text-center min-[761px]:max-[1080px]:static min-[761px]:max-[1080px]:mt-9 max-[760px]:static">
          Secure access for authorised operations teams
        </footer>
      </section>
    </main>
  );
}
