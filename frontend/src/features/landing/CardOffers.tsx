const OFFERS = [
  { stat: '6', sup: '%', statLbl: 'cash back offer', img: 'card-red.png', alt: 'Customized Cash Rewards card', name: 'Customized Cash Rewards', offer: ['$200', 'online bonus offer'] },
  { stat: '1.5', sup: '%', statLbl: 'cash back', img: 'card-silver.png', alt: 'Unlimited Cash Rewards card', name: 'Unlimited Cash Rewards', offer: ['$250', 'online bonus offer'] },
  { stat: '1.5', sup: '', statLbl: 'points for every $1', img: 'card-blue.png', alt: 'Travel Rewards card', name: 'Travel Rewards', offer: ['25,000 online', 'bonus points offer'] },
  { stat: '0', sup: '%', statLbl: 'intro APR offer', img: 'card-white.png', alt: 'BankAmericard', name: 'BankAmericard®', offer: ['Intro APR offer', 'for 21 billing cycles'] },
];

export function CardOffers() {
  return (
    <section className="cards" aria-labelledby="cards-h">
      <h2 id="cards-h">Choose the card that works for you</h2>
      <ul className="card-grid">
        {OFFERS.map((o) => (
          <li key={o.name} className="card-col">
            <div className="stat">{o.stat}{o.sup && <sup>{o.sup}</sup>}</div>
            <div className="statlbl">{o.statLbl}</div>
            <div className="noannual">No annual fee.</div>
            <img className="card-img" src={`/images/${o.img}`} alt={o.alt} width={250} height={150} />
            <div className="cardname">{o.name}</div>
            <span className="offer">{o.offer[0]}<br />{o.offer[1]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
