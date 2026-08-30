// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — strategy registry (100+ real, well-known strategies)
// Each entry: key, name (EN/FA), category, market, timeframes, weight,
// baseline score, overlay types. Performance is tracked in strategy_performance.
// The engine combines these via weighted consensus + conflict detection.
// ─────────────────────────────────────────────────────────────────────────────
export interface StrategyDef {
  key: string;
  name: string;
  name_fa: string;
  category: string;
  category_fa: string;
  market: string; // all | crypto | forex
  timeframes: string[];
  weight: number;
  baseline: number; // baseline score contribution when signal is positive
  overlay: string[];
}

const ALL_TF = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const SHORT_TF = ["1m", "5m", "15m", "30m"];
const MED_TF = ["15m", "30m", "1h", "4h"];
const LONG_TF = ["1h", "4h", "1d"];

const CAT: Record<string, [string, string]> = {
  pa: ["price_action", "پرایس اکشن"],
  cp: ["chart_patterns", "الگوهای نموداری"],
  trend: ["trend", "روند"],
  mom: ["momentum", "مومنتوم"],
  mr: ["mean_reversion", "بازگشت به میانگین"],
  bo: ["breakout", "شکست"],
  scalp: ["scalping", "اسکالپینگ"],
  swing: ["swing", "سوینگ"],
  smc: ["smc", "اس‌ام‌سی"],
  ict: ["ict", "آی‌سی‌تی"],
  vol: ["volume", "حجم"],
  vola: ["volatility", "نوسان"],
  sr: ["support_resistance", "حمایت و مقاومت"],
  mtf: ["multi_timeframe", "چند تایم‌فریم"],
  ms: ["market_structure", "ساختار بازار"],
  liq: ["liquidity", "نقدینگی"],
  ind: ["indicator", "اندیکاتوری"],
  cry: ["crypto", "مخصوص کریپتو"],
  fx: ["forex", "مخصوص فارکس"],
  hy: ["hybrid", "ترکیبی"],
};

type Row = [string, string, string, keyof typeof CAT, string, string[], number, number, string[]];

const ROWS: Row[] = [
  // ── Trend following ──
  ["ema_cross", "EMA Crossover", "تقاطع EMA", "trend", "all", MED_TF, 1.0, 62, ["ema"]],
  ["ema_50_200", "50/200 EMA Golden Cross", "تقاطع طلایی EMA 50/200", "trend", "all", LONG_TF, 1.0, 64, ["ema"]],
  ["supertrend", "SuperTrend", "سوپرترند", "trend", "all", MED_TF, 1.0, 60, ["supertrend"]],
  ["trendline_break", "Trendline Break", "شکست خط روند", "trend", "all", MED_TF, 1.0, 58, ["trendline"]],
  ["macd_trend", "MACD Trend Confirmation", "تأیید روند با MACD", "trend", "all", MED_TF, 0.8, 55, ["macd"]],
  ["adx_trend", "ADX Strong Trend", "روند قوی با ADX", "trend", "all", MED_TF, 0.8, 54, ["adx"]],
  ["ichimoku", "Ichimoku Cloud", "ابر ایچیموکو", "trend", "all", LONG_TF, 0.9, 60, ["ichimoku"]],
  ["parabolic_sar", "Parabolic SAR", "پارابولیک سار", "trend", "all", SHORT_TF, 0.7, 50, ["psar"]],
  ["vwap_trend", "VWAP Trend Bias", "بایاس روند VWAP", "trend", "crypto", SHORT_TF, 0.8, 55, ["vwap"]],
  ["donchian", "Donchian Channel Trend", "کانال دانچیان", "trend", "all", MED_TF, 0.8, 56, ["donchian"]],
  ["keltner_trend", "Keltner Channel Trend", "روند کانال کلتنر", "trend", "all", MED_TF, 0.7, 52, ["keltner"]],
  ["linear_reg", "Linear Regression Slope", "شیب رگرسیون خطی", "trend", "all", MED_TF, 0.7, 53, ["regression"]],
  ["chandelier", "Chandelier Exit", "خروج چلندیر", "trend", "all", MED_TF, 0.7, 50, []],
  ["hurst_trend", "Hurst Exponent Trend", "توان هرست", "trend", "all", MED_TF, 0.6, 48, []],
  // ── Momentum ──
  ["rsi_momentum", "RSI Momentum", "مومنتوم RSI", "mom", "all", SHORT_TF, 0.8, 55, ["rsi"]],
  ["rsi_div", "RSI Divergence", "واگرایی RSI", "mom", "all", MED_TF, 0.9, 58, ["rsi"]],
  ["stoch_mom", "Stochastic Momentum", "مومنتوم استوکاستیک", "mom", "all", SHORT_TF, 0.7, 50, ["stoch"]],
  ["cci_mom", "CCI Momentum", "مومنتوم CCI", "mom", "all", SHORT_TF, 0.7, 50, ["cci"]],
  ["roc_mom", "Rate of Change", "نرخ تغییر (ROC)", "mom", "all", SHORT_TF, 0.7, 49, ["roc"]],
  ["williams_r", "Williams %R", "ویلیامز %R", "mom", "all", SHORT_TF, 0.6, 47, ["wr"]],
  ["macd_mom", "MACD Momentum", "مومنتوم MACD", "mom", "all", MED_TF, 0.8, 54, ["macd"]],
  ["trix", "TRIX Momentum", "تری‌ایکس", "mom", "all", MED_TF, 0.6, 48, ["trix"]],
  ["awesome_osc", "Awesome Oscillator", "اوسیلاتور عالی", "mom", "all", SHORT_TF, 0.6, 46, ["ao"]],
  ["momentum_100", "Momentum 100", "مومنتوم ۱۰۰", "mom", "all", MED_TF, 0.6, 45, []],
  // ── Mean reversion ──
  ["bollinger_rev", "Bollinger Mean Reversion", "بازگشت به میانگین بولینگر", "mr", "all", SHORT_TF, 0.8, 52, ["bb"]],
  ["rsi_rev", "RSI Oversold/Overbought", "اشباع خرید/فروش RSI", "mr", "all", SHORT_TF, 0.8, 50, ["rsi"]],
  ["stoch_rev", "Stochastic Reversion", "بازگشت استوکاستیک", "mr", "all", SHORT_TF, 0.7, 48, ["stoch"]],
  ["mean_rev_band", "Moving Average Band Reversion", "بازگشت به باند میانگین", "mr", "all", MED_TF, 0.7, 49, ["ema"]],
  ["zscore_rev", "Z-Score Reversion", "بازگشت Z-Score", "mr", "crypto", SHORT_TF, 0.7, 48, []],
  ["vortex_rev", "Vortex Reversion", "بازگشت ورتکس", "mr", "all", MED_TF, 0.5, 42, []],
  ["gap_fill", "Gap Fill", "پر کردن گپ", "mr", "forex", SHORT_TF, 0.6, 45, []],
  ["pivot_rev", "Pivot Point Reversion", "بازگشت از پیوت", "mr", "all", SHORT_TF, 0.7, 47, ["pivot"]],
  // ── Breakout ──
  ["range_breakout", "Range Breakout", "شکست رنج", "bo", "all", SHORT_TF, 0.9, 60, ["range"]],
  ["box_breakout", "Trading Box Breakout", "شکست باکس", "bo", "all", MED_TF, 0.8, 56, ["box"]],
  ["flag_breakout", "Flag Breakout", "شکست پرچم", "bo", "all", MED_TF, 0.8, 57, ["pattern"]],
  ["pennant_breakout", "Pennant Breakout", "شکست پننت", "bo", "all", MED_TF, 0.8, 57, ["pattern"]],
  ["triangle_breakout", "Triangle Breakout", "شکست مثلث", "bo", "all", MED_TF, 0.8, 58, ["triangle"]],
  ["wedge_breakout", "Wedge Breakout", "شکست گوه", "bo", "all", MED_TF, 0.7, 55, ["wedge"]],
  ["vol_breakout", "Volume Breakout", "شکست با حجم", "bo", "all", SHORT_TF, 0.9, 60, ["volume"]],
  ["h4_breakout", "H4 Range Breakout", "شکست رنج ۴ ساعته", "bo", "all", LONG_TF, 0.8, 59, ["range"]],
  ["session_breakout", "Session Open Breakout", "شکست بازشدن سشن", "bo", "forex", SHORT_TF, 0.7, 52, []],
  ["opening_range", "Opening Range Breakout", "شکست رنج بازگشایی", "bo", "all", SHORT_TF, 0.7, 53, ["range"]],
  // ── Scalping ──
  ["m1_ema_scalp", "M1 EMA Scalp", "اسکالپ EMA یک دقیقه", "scalp", "all", ["1m"], 0.7, 48, ["ema"]],
  ["m5_rsi_scalp", "M5 RSI Scalp", "اسکالپ RSI پنج دقیقه", "scalp", "all", ["5m"], 0.7, 47, ["rsi"]],
  ["m5_breakout_scalp", "M5 Breakout Scalp", "اسکالپ شکست ۵ دقیقه", "scalp", "all", ["5m"], 0.7, 49, ["range"]],
  ["vwap_scalp", "VWAP Scalp", "اسکالپ VWAP", "scalp", "crypto", ["1m", "5m"], 0.7, 50, ["vwap"]],
  ["tick_reversal", "Tick Reversal Scalp", "اسکالپ بازگشت تیک", "scalp", "all", ["1m"], 0.5, 42, []],
  ["micro_trend", "Micro Trend Scalp", "اسکالپ میکرو روند", "scalp", "all", ["1m", "5m"], 0.6, 45, ["ema"]],
  ["liquidity_sweep_scalp", "Liquidity Sweep Scalp", "اسکالپ سوئیپ نقدینگی", "scalp", "all", ["5m", "15m"], 0.8, 52, ["liq"]],
  // ── Swing ──
  ["swing_break_retest", "Swing Break & Retest", "شکست و بازآزمایی سوینگ", "swing", "all", LONG_TF, 0.9, 62, ["sr"]],
  ["weekly_pivot_swing", "Weekly Pivot Swing", "سوینگ پیوت هفتگی", "swing", "all", ["1d"], 0.8, 58, ["pivot"]],
  ["monthly_structure", "Monthly Structure Swing", "ساختار ماهانه", "swing", "all", ["1d"], 0.8, 56, ["ms"]],
  ["daily_supply_swing", "Daily Supply/Demand Swing", "سوینگ عرضه/تقاضای روزانه", "swing", "all", ["4h", "1d"], 0.8, 57, ["sd"]],
  ["fib_swing", "Fibonacci Swing Retracement", "بازگشت فیبوناچی سوینگ", "swing", "all", ["4h", "1d"], 0.8, 56, ["fib"]],
  // ── Price action ──
  ["pin_bar", "Pin Bar", "پین بار", "pa", "all", SHORT_TF, 0.8, 55, ["candle"]],
  ["engulfing", "Engulfing Pattern", "الگوی اینگالفینگ", "pa", "all", SHORT_TF, 0.8, 54, ["candle"]],
  ["inside_bar", "Inside Bar", "این ساید بار", "pa", "all", SHORT_TF, 0.7, 50, ["candle"]],
  ["three_white", "Three White Soldiers", "سه سرباز سفید", "pa", "all", MED_TF, 0.7, 52, ["candle"]],
  ["three_black", "Three Black Crows", "سه کلاغ سیاه", "pa", "all", MED_TF, 0.7, 52, ["candle"]],
  ["morning_star", "Morning Star", "ستاره صبحگاهی", "pa", "all", MED_TF, 0.7, 53, ["candle"]],
  ["evening_star", "Evening Star", "ستاره شامگاهی", "pa", "all", MED_TF, 0.7, 53, ["candle"]],
  ["hammer", "Hammer", "چکش", "pa", "all", SHORT_TF, 0.7, 50, ["candle"]],
  ["shooting_star", "Shooting Star", "ستاره دنباله‌دار", "pa", "all", SHORT_TF, 0.7, 50, ["candle"]],
  ["doji_star", "Doji Star Reversal", "بازگشت دوجی", "pa", "all", SHORT_TF, 0.6, 46, ["candle"]],
  ["harami", "Harami Pattern", "الگوی هارامی", "pa", "all", MED_TF, 0.6, 48, ["candle"]],
  ["tweezer", "Tweezer Top/Bottom", "توئیزر", "pa", "all", SHORT_TF, 0.6, 47, ["candle"]],
  ["price_action_bb", "Price Action at BB", "پرایس اکشن روی باند", "pa", "all", SHORT_TF, 0.7, 49, ["bb"]],
  ["pdh_pdl", "PDH/PDL Reversal", "بازگشت از سقف/کف روز قبل", "pa", "all", SHORT_TF, 0.7, 50, ["sr"]],
  // ── SMC / ICT ──
  ["order_block", "Order Block", "بلاک سفارش", "smc", "all", MED_TF, 1.0, 62, ["ob"]],
  ["fvg", "Fair Value Gap", "شکاف ارزش منصفانه (FVG)", "smc", "all", MED_TF, 1.0, 61, ["fvg"]],
  ["bos", "Break of Structure", "شکست ساختار (BOS)", "smc", "all", MED_TF, 1.0, 63, ["bos"]],
  ["choch", "Change of Character", "تغییر ماهیت (CHoCH)", "smc", "all", MED_TF, 1.0, 63, ["choch"]],
  ["mss", "Market Structure Shift", "جابه‌جایی ساختار (MSS)", "smc", "all", MED_TF, 0.9, 60, ["mss"]],
  ["liquidity_grab", "Liquidity Grab", "ربایش نقدینگی", "smc", "all", SHORT_TF, 0.9, 58, ["liq"]],
  ["mitigation", "Order Block Mitigation", "می‌تیگیشن بلاک", "smc", "all", MED_TF, 0.8, 57, ["ob"]],
  ["equity_high", "Equal Highs/Lows", "سقف/کف‌های برابر", "smc", "all", MED_TF, 0.7, 53, ["liq"]],
  ["breakers", "Breaker Block", "بریکر بلاک", "smc", "all", MED_TF, 0.7, 54, ["ob"]],
  ["killzones", "ICT Killzones", "کیل‌زون‌های ICT", "ict", "forex", SHORT_TF, 0.7, 52, []],
  ["ict_ob", "ICT Order Block", "بلاک سفارش ICT", "ict", "all", MED_TF, 0.8, 56, ["ob"]],
  ["ict_fvg", "ICT FVG", "FVG آ‌ی‌سی‌تی", "ict", "all", MED_TF, 0.8, 55, ["fvg"]],
  ["smt", "SMT Divergence", "واگرایی SMT", "ict", "all", MED_TF, 0.7, 52, []],
  ["power_of_3", "Power of Three", "قدرت سه", "ict", "all", SHORT_TF, 0.6, 48, []],
  ["judas_swing", "Judas Swing", "جوداس سوینگ", "ict", "all", SHORT_TF, 0.5, 44, []],
  ["silver_bullet", "Silver Bullet", "سیلور بولت", "ict", "forex", SHORT_TF, 0.6, 47, []],
  ["premium_discount", "Premium/Discount", "پریمیوم/دیسکانت", "smc", "all", LONG_TF, 0.8, 55, ["fib"]],
  // ── Volume ──
  ["volume_spike", "Volume Spike", "جهش حجم", "vol", "all", SHORT_TF, 0.8, 55, ["volume"]],
  ["obv_trend", "OBV Trend", "روند OBV", "vol", "all", MED_TF, 0.8, 54, ["obv"]],
  ["vsa", "Volume Spread Analysis", "تحلیل حجم-اسپرد", "vol", "all", MED_TF, 0.8, 53, ["volume"]],
  ["nvp", "Net Volume Pressure", "فشار حجم خالص", "vol", "all", SHORT_TF, 0.7, 50, ["volume"]],
  ["vwap_reclaim", "VWAP Reclaim", "بازپس‌گیری VWAP", "vol", "crypto", SHORT_TF, 0.8, 53, ["vwap"]],
  ["volume_profile", "Volume Profile", "پروفایل حجم", "vol", "all", MED_TF, 0.7, 52, ["vp"]],
  ["cvd", "CVD Divergence", "واگرایی CVD", "vol", "crypto", SHORT_TF, 0.7, 51, []],
  ["funding_basis", "Funding/Basis Signal", "سیگنال فاندینگ", "vol", "crypto", SHORT_TF, 0.6, 46, []],
  // ── Volatility ──
  ["atr_breakout", "ATR Breakout", "شکست ATR", "vola", "all", SHORT_TF, 0.7, 52, ["atr"]],
  ["bb_squeeze", "Bollinger Squeeze", "اسکویز بولینگر", "vola", "all", SHORT_TF, 0.8, 55, ["bb"]],
  ["kc_expansion", "Keltner Expansion", "انبساط کلتنر", "vola", "all", SHORT_TF, 0.7, 50, ["keltner"]],
  ["atr_stop", "ATR Trailing Stop", "حد ضرر شناور ATR", "vola", "all", MED_TF, 0.7, 51, ["atr"]],
  ["volatility_contraction", "Volatility Contraction", "انقباض نوسان", "vola", "all", MED_TF, 0.6, 47, []],
  ["bb_walk", "Bollinger Walk", "راه رفتن روی باند", "vola", "all", SHORT_TF, 0.7, 50, ["bb"]],
  // ── Support / Resistance ──
  ["s_r_levels", "Support/Resistance Levels", "سطوح حمایت/مقاومت", "sr", "all", MED_TF, 0.9, 58, ["sr"]],
  ["s_r_flip", "S/R Flip", "چرخش حمایت/مقاومت", "sr", "all", MED_TF, 0.8, 56, ["sr"]],
  ["pivot_sr", "Pivot S/R", "پیوت حمایت/مقاومت", "sr", "all", MED_TF, 0.8, 54, ["pivot"]],
  ["weekly_sr", "Weekly S/R", "حمایت/مقاومت هفتگی", "sr", "all", LONG_TF, 0.8, 55, ["sr"]],
  ["fib_retracement", "Fibonacci Retracement", "فیبوناچی ریتریس", "sr", "all", MED_TF, 0.8, 54, ["fib"]],
  ["fib_extension", "Fibonacci Extension", "فیبوناچی اکستنشن", "sr", "all", MED_TF, 0.7, 52, ["fib"]],
  ["round_numbers", "Round Number Levels", "سطوح اعداد رند", "sr", "all", SHORT_TF, 0.7, 48, ["sr"]],
  ["double_top", "Double Top", "سقف دوقلو", "cp", "all", MED_TF, 0.8, 56, ["pattern"]],
  ["double_bottom", "Double Bottom", "کف دوقلو", "cp", "all", MED_TF, 0.8, 56, ["pattern"]],
  ["head_shoulders", "Head & Shoulders", "سر و شانه", "cp", "all", LONG_TF, 0.8, 57, ["pattern"]],
  ["cup_handle", "Cup & Handle", "فنجان و دسته", "cp", "all", LONG_TF, 0.7, 54, ["pattern"]],
  ["asc_triangle", "Ascending Triangle", "مثلث صعودی", "cp", "all", MED_TF, 0.8, 56, ["triangle"]],
  ["desc_triangle", "Descending Triangle", "مثلث نزولی", "cp", "all", MED_TF, 0.8, 56, ["triangle"]],
  ["sym_triangle", "Symmetrical Triangle", "مثلث متقارن", "cp", "all", MED_TF, 0.7, 52, ["triangle"]],
  ["bull_flag", "Bull Flag", "پرچم صعودی", "cp", "all", MED_TF, 0.8, 55, ["pattern"]],
  ["bear_flag", "Bear Flag", "پرچم نزولی", "cp", "all", MED_TF, 0.8, 55, ["pattern"]],
  // ── Multi-timeframe ──
  ["mtf_trend_align", "MTF Trend Alignment", "هم‌راستایی روند چند تایم‌فریم", "mtf", "all", ALL_TF, 1.2, 65, ["ema"]],
  ["mtf_breakout", "MTF Breakout Confirmation", "تأیید شکست چند تایم‌فریم", "mtf", "all", ALL_TF, 1.0, 60, ["range"]],
  ["mtf_pullback", "MTF Pullback", "پولبک چند تایم‌فریم", "mtf", "all", ALL_TF, 1.0, 61, ["ema"]],
  ["higher_tf_bias", "Higher TF Bias", "بایاس تایم‌فریم بالاتر", "mtf", "all", ALL_TF, 1.1, 63, []],
  ["mtf_regime", "MTF Regime Filter", "فیلتر رژیم چند تایم‌فریم", "mtf", "all", ALL_TF, 1.0, 60, []],
  // ── Market structure ──
  ["hh_hl", "Higher Highs/Higher Lows", "سقف/کف‌های بالاتر", "ms", "all", MED_TF, 1.0, 62, ["ms"]],
  ["lh_ll", "Lower Highs/Lower Lows", "سقف/کف‌های پایین‌تر", "ms", "all", MED_TF, 1.0, 62, ["ms"]],
  ["trend_structure", "Trend Structure Confirmation", "تأیید ساختار روند", "ms", "all", MED_TF, 0.9, 60, ["ms"]],
  ["range_structure", "Range Structure", "ساختار رنج", "ms", "all", MED_TF, 0.7, 50, ["range"]],
  ["reversal_structure", "Reversal Structure", "ساختار بازگشتی", "ms", "all", MED_TF, 0.8, 55, ["ms"]],
  // ── Liquidity ──
  ["liquidity_pool", "Liquidity Pool Target", "هدف استخر نقدینگی", "liq", "all", MED_TF, 0.8, 55, ["liq"]],
  ["stop_hunt", "Stop Hunt Detection", "تشخیص شکار استاپ", "liq", "all", SHORT_TF, 0.8, 54, ["liq"]],
  ["buy_side_liq", "Buy-Side Liquidity", "نقدینگی سمت خرید", "liq", "all", MED_TF, 0.7, 52, ["liq"]],
  ["sell_side_liq", "Sell-Side Liquidity", "نقدینگی سمت فروش", "liq", "all", MED_TF, 0.7, 52, ["liq"]],
  ["asian_range", "Asian Range Liquidity", "نقدینگی رنج آسیایی", "liq", "forex", SHORT_TF, 0.6, 48, []],
  // ── Indicator combos ──
  ["ema_rsi_combo", "EMA + RSI Combo", "ترکیب EMA و RSI", "ind", "all", SHORT_TF, 0.8, 55, ["ema", "rsi"]],
  ["macd_ema_combo", "MACD + EMA Combo", "ترکیب MACD و EMA", "ind", "all", MED_TF, 0.8, 56, ["macd", "ema"]],
  ["bb_rsi_combo", "BB + RSI Combo", "ترکیب بولینگر و RSI", "ind", "all", SHORT_TF, 0.7, 52, ["bb", "rsi"]],
  ["adx_ema_combo", "ADX + EMA Combo", "ترکیب ADX و EMA", "ind", "all", MED_TF, 0.8, 55, ["adx", "ema"]],
  ["stoch_macd_combo", "Stochastic + MACD Combo", "ترکیب استوکاستیک و MACD", "ind", "all", SHORT_TF, 0.7, 52, ["stoch", "macd"]],
  ["atr_ema_combo", "ATR + EMA Combo", "ترکیب ATR و EMA", "ind", "all", SHORT_TF, 0.7, 51, ["atr", "ema"]],
  ["cci_atr_combo", "CCI + ATR Combo", "ترکیب CCI و ATR", "ind", "all", SHORT_TF, 0.6, 48, ["cci", "atr"]],
  ["rsi_ma_combo", "RSI + Moving Average Combo", "ترکیب RSI و میانگین", "ind", "all", SHORT_TF, 0.7, 50, ["rsi", "ema"]],
  ["macd_hist", "MACD Histogram Trend", "هیستوگرام MACD", "ind", "all", SHORT_TF, 0.7, 51, ["macd"]],
  ["squeeze_combo", "TTM Squeeze + Momentum", "اسکویز TTM و مومنتوم", "ind", "all", SHORT_TF, 0.8, 54, ["bb"]],
  ["awesome_macd", "Awesome + MACD", "عالی + MACD", "ind", "all", SHORT_TF, 0.6, 49, ["ao", "macd"]],
  ["ema_fib_combo", "EMA + Fibonacci Combo", "ترکیب EMA و فیبوناچی", "ind", "all", MED_TF, 0.8, 55, ["ema", "fib"]],
  ["vwap_bb_combo", "VWAP + BB Combo", "ترکیب VWAP و بولینگر", "ind", "crypto", SHORT_TF, 0.7, 51, ["vwap", "bb"]],
  // ── Crypto-specific ──
  ["crypto_dom", "BTC Dominance Filter", "فیلتر دامیننس بیت‌کوین", "cry", "crypto", MED_TF, 0.7, 52, []],
  ["crypto_funding", "Funding Rate Reversal", "بازگشت نرخ فاندینگ", "cry", "crypto", SHORT_TF, 0.7, 50, []],
  ["alt_season", "Altcoin Season Rotation", "چرخش فصل آلت‌کوین", "cry", "crypto", LONG_TF, 0.6, 48, []],
  ["stable_flow", "Stablecoin Inflow", "جریان استیبل‌کوین", "cry", "crypto", LONG_TF, 0.6, 47, []],
  ["eth_btc_ratio", "ETH/BTC Ratio Trend", "روند نسبت ETH/BTC", "cry", "crypto", LONG_TF, 0.6, 46, []],
  ["exchange_flow", "Exchange Netflow", "جریان خالص صرافی", "cry", "crypto", MED_TF, 0.6, 45, []],
  ["hash_rate", "Hash Rate Trend", "روند نرخ هش", "cry", "crypto", LONG_TF, 0.5, 43, []],
  // ── Forex-specific ──
  ["session_london", "London Session Breakout", "شکست سشن لندن", "fx", "forex", SHORT_TF, 0.8, 55, ["range"]],
  ["session_ny", "New York Session", "سشن نیویورک", "fx", "forex", SHORT_TF, 0.7, 52, []],
  ["overlap_session", "London-NY Overlap", "همپوشانی لندن-نیویورک", "fx", "forex", SHORT_TF, 0.8, 54, []],
  ["dxy_filter", "DXY Filter", "فیلتر شاخص دلار", "fx", "forex", MED_TF, 0.8, 53, []],
  ["overnight_swap", "Overnight Swap Carry", "سواپ شبانه", "fx", "forex", LONG_TF, 0.5, 44, []],
  ["euro_flow", "EUR Correlated Flow", "جریان همبسته یورو", "fx", "forex", MED_TF, 0.6, 47, []],
  ["usd_flow", "USD Correlated Flow", "جریان همبسته دلار", "fx", "forex", MED_TF, 0.6, 47, []],
  // ── Hybrid ──
  ["trend_pullback_combo", "Trend + Pullback Hybrid", "ترکیب روند و پولبک", "hy", "all", MED_TF, 1.1, 64, ["ema", "sr"]],
  ["breakout_retest_combo", "Breakout + Retest Hybrid", "ترکیب شکست و بازآزمایی", "hy", "all", MED_TF, 1.0, 61, ["range", "sr"]],
  ["momentum_breakout", "Momentum Breakout Hybrid", "ترکیب مومنتوم و شکست", "hy", "all", SHORT_TF, 0.9, 58, ["rsi", "range"]],
  ["smc_trend_combo", "SMC + Trend Hybrid", "ترکیب SMC و روند", "hy", "all", MED_TF, 1.1, 63, ["ob", "ema"]],
  ["fvg_pullback_combo", "FVG + Pullback Hybrid", "ترکیب FVG و پولبک", "hy", "all", MED_TF, 1.0, 62, ["fvg"]],
  ["bb_trend_combo", "Bollinger + Trend Hybrid", "ترکیب بولینگر و روند", "hy", "all", MED_TF, 0.8, 56, ["bb", "ema"]],
  ["scalp_structure", "Scalp + Structure Hybrid", "ترکیب اسکالپ و ساختار", "hy", "all", SHORT_TF, 0.8, 55, ["ms"]],
  ["regime_breakout", "Regime Filtered Breakout", "شکست با فیلتر رژیم", "hy", "all", MED_TF, 0.9, 59, ["range"]],
];

export function strategyDefs(): StrategyDef[] {
  return ROWS.map(([key, name, name_fa, cat, market, tfs, weight, baseline, overlay]) => {
    const [category, category_fa] = CAT[cat];
    return {
      key,
      name,
      name_fa,
      category,
      category_fa,
      market,
      timeframes: tfs,
      weight,
      baseline,
      overlay,
    };
  });
}
