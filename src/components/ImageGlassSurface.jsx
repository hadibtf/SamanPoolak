import React from 'react';
import styles from './ImageGlassSurface.module.css';

const ImageGlassSurface = ({
  as: Component = 'div',
  className = '',
  children,
  image = '/WEBP/order-list-glass.webp',
  overlayOpacity = 0.7,
  blur = 10,
  ...props
}) => (
  <Component
    {...props}
    className={`glass-card ${styles.surface}${className ? ` ${className}` : ''}`}
    style={{
      '--glass-surface-image': `url("${image}")`,
      '--glass-surface-overlay': `rgba(255, 255, 255, ${overlayOpacity})`,
      '--glass-surface-blur': `${blur}px`,
      ...props.style,
    }}
  >
    {children}
  </Component>
);

export default ImageGlassSurface;
