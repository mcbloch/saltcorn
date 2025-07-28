import requests
from urllib.parse import urljoin
from urllib.request import urlopen

class Session:
  def __init__(self, base_url):
    self.base_url = base_url
    self.reset()

  def __read_response(self, resp):
    self.status = resp.status_code
    self.content = resp.text
    if self.status >= 300 and self.status <400:
        ws = self.content.split()
        self.redirect_url=ws[len(ws)-1]
    else:
        self.redirect_url = None

  def sessionID(self):
    cookiesDict = self.session.cookies.get_dict()
    if 'connect.sid' in cookiesDict:
      return self.session.cookies.get_dict()['connect.sid']
    else:
      return ""

  def get(self, url, allow_redirects=False, timeout=30):
    resp = self.session.get(urljoin(self.base_url, url), allow_redirects=allow_redirects, timeout=timeout)
    self.__read_response(resp)

  def postForm(self, url, data, allow_redirects=False):
    resp = self.session.post(urljoin(self.base_url, url), data=data, allow_redirects=allow_redirects)
    self.__read_response(resp)

  def apiPost(self, url, data, allow_redirects=False):
    headers = {'Content-Type': 'application/json'}
    resp = self.session.post(urljoin(self.base_url, url), json=data, headers=headers, allow_redirects=allow_redirects)
    self.__read_response(resp)

  def follow_redirect(self):
    self.get(self.redirect_url)


  def reset(self):
    self.status = None
    self.content = None
    self.redirect_url = None
    self.session = requests.Session()
  
