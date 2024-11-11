package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Template struct {
	templates *template.Template
}

func (t *Template) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

func staticRender(template string) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.Render(http.StatusOK, template, nil)
	}
}

func main() {
	e := echo.New()
	e.Renderer = &Template{
		templates: template.Must(template.ParseFS(os.DirFS("."), "views/*.html")),
	}

	// Uncomment if you want browser specific logs
	//e.Use(middleware.Logger())
	e.Use(middleware.Secure())
	e.Use(middleware.RemoveTrailingSlash())

	ss := SignalingServer{
		users: []*User{},
		rooms: &RoomService{
			DB: &RoomSlice{
				rooms: make([]*Room, 0),
			},
		},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}

	e.Static("/assets", "static")

	e.GET("/assets/*", func(c echo.Context) error {
		filePath := c.Param("*")
	
		if strings.HasSuffix(filePath, ".js") {
			return c.Attachment(filepath.Join("static", filePath), "inline; filename=\""+filepath.Base(filePath)+"\"; Content-Type: text/javascript") 
		} else {
			return c.File(filepath.Join("static", filePath)) 
		}
	})
	e.GET("/", staticRender("landing"))
	e.GET("/initiate", initiateHandler(ss.rooms, &ss))
	e.GET("/room", staticRender("main"))
	e.GET("/websocket", ss.Handler)

	//e.Logger.Fatal(e.Start(":9090"))
	e.Logger.Fatal(e.Start("localhost:9090"))
}
