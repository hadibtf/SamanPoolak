const SUPPORTED_TONES = new Set(['gold', 'silver', 'green', 'matte']);

const MetallicText = ({ tone = 'gold', as: Element = 'span', className = '', children, ...props }) => {
  const safeTone = SUPPORTED_TONES.has(tone) ? tone : 'matte';
  const classes = ['metallic-text', `metallic-text--${safeTone}`, className].filter(Boolean).join(' ');

  return <Element {...props} className={classes}>{children}</Element>;
};

export default MetallicText;
