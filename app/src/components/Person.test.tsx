import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, PersonLabel } from './Person';

const lan = { id: 'P1', firstName: 'Lan', lastName: 'Nguyễn Thị', avatarUrl: 'https://files.cogover.example/0/F1/small/a.png' };

describe('Avatar / PersonLabel', () => {
  it('shows the photo, then the letter avatar when the image fails to load', () => {
    const { container } = render(<Avatar person={lan} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', lan.avatarUrl);
    expect(img).not.toHaveAttribute('crossorigin');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.avatar')).toHaveTextContent('L');
  });

  it('renders the letter avatar without a photo and an empty label', () => {
    const { container } = render(<PersonLabel person={{ ...lan, avatarUrl: null }} role="Người giao" testId="who" />);
    expect(screen.getByTestId('who')).toHaveAttribute('title', 'Người giao: Nguyễn Thị Lan');
    expect(container.querySelector('.avatar')).toHaveTextContent('L');
    render(<PersonLabel person={null} empty="Chưa có người giao" testId="none" />);
    expect(screen.getByTestId('none')).toHaveTextContent('Chưa có người giao');
    render(<PersonLabel person={{ id: 'P9', firstName: '', lastName: '', avatarUrl: null }} testId="noname" />);
    expect(screen.getByTestId('noname')).toHaveTextContent('Không rõ tên');
  });
});
